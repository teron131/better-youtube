/// <reference types="chrome" />

/**
 * Owns persisted video records, settings preservation, quota retries, and whole-video cache eviction.
 */

import { STORAGE, STORAGE_CLEANUP, STORAGE_KEYS, YOUTUBE } from "./constants.ts";
import {
  getStorageUsage,
  sessionStorageGet,
  sessionStorageGetMultiple,
  sessionStorageRemove,
  sessionStorageSet,
  storageGet,
  storageGetAll,
  storageGetMultiple,
  storageRemove,
  storageSet,
} from "./storageBrowser.ts";
import { migrateSummaryText } from "./summaryMigration.ts";
export { getStorageUsage } from "./storageBrowser.ts";
export type { StorageUsage } from "./storageBrowser.ts";

// ============================================================================
// Types
// ============================================================================

export interface SubtitleSegment {
  text: string;
  startTime: number;
  endTime: number;
  startTimeText?: string | null;
}

export interface VideoMetadata {
  url: string;
  title: string | null;
  thumbnail: string | null;
  author: string | null;
  duration: string | null;
  uploadDate: string | null;
  viewCount: number | null;
  likeCount: number | null;
  description?: string | null;
}

export interface StoredSummary {
  summary: string;
  timestamp: number;
  modelUsed: string;
  targetLanguage?: string | null;
}

export interface ClearStoredDataResult {
  localKeysRemoved: number;
  sessionKeysRemoved: number;
}

interface VideoStorageMeta {
  updatedAt: number;
}

// ============================================================================
// Storage Keys
// ============================================================================

const StorageKeys = {
  subtitles: (videoId: string) => videoId,
  metadata: (videoId: string) => `video_info_${videoId}`,
  summary: (videoId: string) => `summary_${videoId}`,
  meta: (videoId: string) => `video_meta_${videoId}`,
} as const;

export function getSubtitlesStorageKey(videoId: string): string {
  return StorageKeys.subtitles(videoId);
}

export function getVideoMetadataStorageKey(videoId: string): string {
  return StorageKeys.metadata(videoId);
}

export function getSummaryStorageKey(videoId: string): string {
  return StorageKeys.summary(videoId);
}

function createVideoStoragePayload(
  videoId: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const updatedAt = Date.now();
  return {
    [key]: value,
    [StorageKeys.meta(videoId)]: {
      updatedAt,
    } satisfies VideoStorageMeta,
  };
}

async function saveVideoScopedItem(
  videoId: string,
  key: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await ensureStorageSpace();
  await setWithQuotaRetry(createVideoStoragePayload(videoId, key, value), signal);
}

// ============================================================================
// Core Storage Operations
// ============================================================================

const WRITE_RATE_RETRY_LIMIT = 3;
const WRITE_RATE_BACKOFF_BASE_MS = 250;
const QUOTA_CLEANUP_RETRY_LIMIT = 3;
const PROTECTED_STORAGE_HEADROOM_BYTES = 256 * 1024;
const METADATA_KEY_PREFIX = "video_info_";
const SUMMARY_KEY_PREFIX = "summary_";
const VIDEO_META_KEY_PREFIX = "video_meta_";
const PROTECTED_STORAGE_KEYS = new Set(Object.values(STORAGE_KEYS));
const SETTINGS_STORAGE_KEYS_TO_KEEP = new Set<string>([
  STORAGE_KEYS.LLM_API_KEY,
  STORAGE_KEYS.LLM_BASE_URL,
  STORAGE_KEYS.LLM_MODEL_PREFIX_MODE,
  STORAGE_KEYS.GEMINI_API_KEY,
  STORAGE_KEYS.SUMMARIZER_PROVIDER,
  STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
  STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
  STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
  STORAGE_KEYS.REFINER_CUSTOM_MODEL,
  STORAGE_KEYS.AUTO_GENERATE,
  STORAGE_KEYS.SHOW_SUBTITLES,
  STORAGE_KEYS.CAPTION_FONT_SIZE,
  STORAGE_KEYS.SUMMARY_FONT_SIZE,
  STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
  STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
  STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT,
  STORAGE_KEYS.REFINER_MODEL_COST_LIMIT,
  STORAGE_KEYS.VIEWS_FILTER_ENABLED,
  STORAGE_KEYS.LIVE_VIEWER_FILTER_ENABLED,
  STORAGE_KEYS.MIX_FILTER_ENABLED,
  STORAGE_KEYS.DURATION_FILTER_ENABLED,
  STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
  STORAGE_KEYS.AGE_FILTER_ENABLED,
  STORAGE_KEYS.ENGLISH_ONLY_TITLES,
  STORAGE_KEYS.PRESERVE_SUBSCRIBED_CHANNELS,
  STORAGE_KEYS.MIN_VIEWS,
  STORAGE_KEYS.MIN_LIVE_VIEWERS,
  STORAGE_KEYS.MIN_DURATION,
  STORAGE_KEYS.MAX_DURATION,
  STORAGE_KEYS.MAX_AGE_YEARS,
  STORAGE_KEYS.FILTER_KEYWORDS,
]);
const SESSION_DATA_KEYS_TO_CLEAR = [
  STORAGE_KEYS.FILTERED_VIDEOS,
  STORAGE_KEYS.FILTERED_VIDEO_KEYS,
] as const;
const VIDEO_STORAGE_BUDGET_BYTES = Math.min(
  STORAGE.MAX_STORAGE_BYTES,
  STORAGE.QUOTA_BYTES - PROTECTED_STORAGE_HEADROOM_BYTES,
);

function isProtectedStorageKey(key: string): boolean {
  return PROTECTED_STORAGE_KEYS.has(key as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]);
}

function isQuotaError(error: unknown): error is Error {
  return error instanceof Error && error.message.toLowerCase().includes("quota");
}

function isWriteRateQuotaError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("MAX_WRITE_OPERATIONS");
}

async function setWithQuotaRetry(
  items: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<void> {
  let quotaCleanupAttempts = 0;

  for (let attempt = 0; attempt <= WRITE_RATE_RETRY_LIMIT; attempt++) {
    try {
      signal?.throwIfAborted();
      await storageSet(items);
      return;
    } catch (error) {
      if (isWriteRateQuotaError(error)) {
        if (attempt >= WRITE_RATE_RETRY_LIMIT) {
          throw error;
        }
        const backoffMs = WRITE_RATE_BACKOFF_BASE_MS * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (isQuotaError(error) && quotaCleanupAttempts < QUOTA_CLEANUP_RETRY_LIMIT) {
        quotaCleanupAttempts += 1;
        await cleanupOldVideos(STORAGE.CLEANUP_BATCH_SIZE * quotaCleanupAttempts);
        continue;
      }

      if (isQuotaError(error)) {
        throw new Error(
          "Storage is still full after clearing cached videos. Please remove some saved extension data and try again.",
        );
      }

      throw error;
    }
  }
}

// ============================================================================
// Video Data Storage
// ============================================================================

export async function getSubtitles(videoId: string): Promise<SubtitleSegment[] | null> {
  return storageGet<SubtitleSegment[]>(StorageKeys.subtitles(videoId));
}

export async function saveSubtitles(videoId: string, subtitles: SubtitleSegment[]): Promise<void> {
  await saveVideoScopedItem(videoId, StorageKeys.subtitles(videoId), subtitles);
}

export async function getVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  return storageGet<VideoMetadata>(StorageKeys.metadata(videoId));
}

export async function saveVideoMetadata(videoId: string, metadata: VideoMetadata): Promise<void> {
  return saveVideoScopedItem(videoId, StorageKeys.metadata(videoId), metadata);
}

export async function getSummary(videoId: string): Promise<StoredSummary | null> {
  const key = StorageKeys.summary(videoId);
  const stored = await storageGet<Omit<StoredSummary, "summary"> & { summary: unknown }>(key);
  if (!stored) return null;
  const summary = migrateSummaryText(stored.summary);
  if (summary === null) return null;
  const result = { ...stored, summary };
  if (typeof stored.summary !== "string") await setWithQuotaRetry({ [key]: result });
  return result;
}

export async function saveSummary(
  videoId: string,
  summary: string,
  modelUsed: string,
  targetLanguage?: string | null,
  signal?: AbortSignal,
): Promise<void> {
  const key = StorageKeys.summary(videoId);
  const storedSummary: StoredSummary = {
    summary,
    timestamp: Date.now(),
    modelUsed,
    targetLanguage,
  };
  await saveVideoScopedItem(videoId, key, storedSummary, signal);
}

// ============================================================================
// Settings Storage
// ============================================================================

export async function getStorageValue<T>(key: string): Promise<T | null> {
  return storageGet<T>(key);
}

export async function setStorageValue<T>(key: string, value: T): Promise<void> {
  if (isProtectedStorageKey(key)) {
    await ensureStorageHeadroom(PROTECTED_STORAGE_HEADROOM_BYTES);
  }
  return setWithQuotaRetry({ [key]: value });
}

export async function removeStorageValue(key: string): Promise<void> {
  await storageRemove([key]);
}

export async function getSessionStorageValue<T>(key: string): Promise<T | null> {
  return sessionStorageGet<T>(key);
}

export async function setSessionStorageValue<T>(key: string, value: T): Promise<void> {
  await sessionStorageSet({ [key]: value });
}

export async function removeSessionStorageValue(key: string): Promise<void> {
  await sessionStorageRemove([key]);
}

export async function getStorageValues<T extends Record<string, unknown>>(
  keys: string[],
): Promise<Partial<T>> {
  return storageGetMultiple<T>(keys);
}

// ============================================================================
// Storage Cleanup & Usage
// ============================================================================

export async function clearStoredDataExceptSettings(): Promise<ClearStoredDataResult> {
  const allItems = await storageGetAll();
  const localKeysToRemove = Object.keys(allItems).filter(
    (key) => !SETTINGS_STORAGE_KEYS_TO_KEEP.has(key),
  );

  if (localKeysToRemove.length > 0) {
    await storageRemove(localKeysToRemove);
  }

  const sessionItems = await sessionStorageGetMultiple<Record<string, unknown>>([
    ...SESSION_DATA_KEYS_TO_CLEAR,
  ]);
  const sessionKeysToRemove = Object.keys(sessionItems);
  if (sessionKeysToRemove.length > 0) {
    await sessionStorageRemove(sessionKeysToRemove);
  }

  return {
    localKeysRemoved: localKeysToRemove.length,
    sessionKeysRemoved: sessionKeysToRemove.length,
  };
}

type VideoStorageGroup = {
  videoId: string;
  keys: string[];
  lastUpdatedAt: number | null;
  summaryTimestamp: number | null;
};

function parseFiniteTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveVideoIdFromStorageKey(key: string, value: unknown): string | null {
  if (isProtectedStorageKey(key)) {
    return null;
  }
  if (key.length === YOUTUBE.VIDEO_ID_LENGTH && Array.isArray(value)) {
    return key;
  }
  if (key.startsWith(METADATA_KEY_PREFIX)) {
    return key.slice(METADATA_KEY_PREFIX.length);
  }
  if (key.startsWith(SUMMARY_KEY_PREFIX)) {
    return key.slice(SUMMARY_KEY_PREFIX.length);
  }
  if (key.startsWith(VIDEO_META_KEY_PREFIX)) {
    return key.slice(VIDEO_META_KEY_PREFIX.length);
  }
  return null;
}

function getVideoStorageGroups(allItems: Record<string, unknown>): VideoStorageGroup[] {
  const groups = new Map<string, VideoStorageGroup>();

  Object.entries(allItems).forEach(([key, value]) => {
    const videoId = resolveVideoIdFromStorageKey(key, value);
    if (!videoId) return;

    if (!groups.has(videoId)) {
      groups.set(videoId, {
        videoId,
        keys: [],
        lastUpdatedAt: null,
        summaryTimestamp: null,
      });
    }

    const group = groups.get(videoId)!;
    group.keys.push(key);
    if (
      key.startsWith(VIDEO_META_KEY_PREFIX) &&
      value &&
      typeof value === "object" &&
      "updatedAt" in value
    ) {
      group.lastUpdatedAt = parseFiniteTimestamp((value as VideoStorageMeta).updatedAt);
    }
    if (
      key.startsWith(SUMMARY_KEY_PREFIX) &&
      value &&
      typeof value === "object" &&
      "timestamp" in value
    ) {
      group.summaryTimestamp = parseFiniteTimestamp((value as { timestamp?: unknown }).timestamp);
    }
  });

  return Array.from(groups.values());
}

function getVideoGroupTimestamp(group: VideoStorageGroup): number {
  return group.lastUpdatedAt ?? group.summaryTimestamp ?? 0;
}

async function cleanupOldVideos(countToRemove: number): Promise<void> {
  const allItems = await storageGetAll();
  const groups = getVideoStorageGroups(allItems);

  if (groups.length === 0) return;

  const removeCount =
    groups.length <= countToRemove
      ? Math.max(1, groups.length - STORAGE_CLEANUP.MIN_VIDEOS_TO_KEEP)
      : countToRemove;

  const groupsToRemove = groups
    .slice()
    .sort((a, b) => {
      const timeA = getVideoGroupTimestamp(a);
      const timeB = getVideoGroupTimestamp(b);
      if (timeA !== timeB) return timeA - timeB;
      return a.videoId.localeCompare(b.videoId);
    })
    .slice(0, removeCount);

  const keysToRemove = groupsToRemove.flatMap((group) => group.keys);
  if (keysToRemove.length === 0) return;
  await storageRemove(keysToRemove);
}

async function ensureStorageHeadroom(bytesToKeepAvailable: number): Promise<void> {
  const usage = await getStorageUsage();
  if (usage.bytesAvailable >= bytesToKeepAvailable) return;

  const bytesToFree = bytesToKeepAvailable - usage.bytesAvailable;
  const videosToRemove = Math.max(
    STORAGE.CLEANUP_BATCH_SIZE,
    Math.ceil(bytesToFree / STORAGE.ESTIMATED_VIDEO_SIZE_BYTES),
  );
  await cleanupOldVideos(videosToRemove);
}

export async function ensureStorageSpace(): Promise<void> {
  const usage = await getStorageUsage();

  if (usage.bytesUsed > VIDEO_STORAGE_BUDGET_BYTES) {
    const videosToRemove = Math.ceil(
      (usage.bytesUsed - VIDEO_STORAGE_BUDGET_BYTES) / STORAGE.ESTIMATED_VIDEO_SIZE_BYTES,
    );
    await cleanupOldVideos(videosToRemove);
  }
}
