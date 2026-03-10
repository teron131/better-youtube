/**
 * Chrome storage management
 */

import { STORAGE, STORAGE_CLEANUP, STORAGE_KEYS, YOUTUBE } from "./constants";

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
  summary: any;
  quality?: any;
  timestamp: number;
  modelUsed: string;
  targetLanguage?: string | null;
}

export interface StorageUsage {
  bytesUsed: number;
  bytesAvailable: number;
  percentageUsed: number;
}

// ============================================================================
// Storage Keys
// ============================================================================

const StorageKeys = {
  subtitles: (videoId: string) => videoId,
  metadata: (videoId: string) => `video_info_${videoId}`,
  summary: (videoId: string) => `summary_${videoId}`,
} as const;

// ============================================================================
// Core Storage Operations
// ============================================================================

const isExtension = typeof chrome !== "undefined" && !!chrome.storage?.local;
const WRITE_RATE_RETRY_LIMIT = 3;
const WRITE_RATE_BACKOFF_BASE_MS = 250;
const QUOTA_CLEANUP_RETRY_LIMIT = 3;
const PROTECTED_STORAGE_HEADROOM_BYTES = 256 * 1024;
const METADATA_KEY_PREFIX = "video_info_";
const SUMMARY_KEY_PREFIX = "summary_";
const PROTECTED_STORAGE_KEYS = new Set(Object.values(STORAGE_KEYS));

function isProtectedStorageKey(key: string): boolean {
  return PROTECTED_STORAGE_KEYS.has(
    key as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
  );
}

function isQuotaError(error: unknown): error is Error {
  return (
    error instanceof Error && error.message.toLowerCase().includes("quota")
  );
}

function isWriteRateQuotaError(error: unknown): error is Error {
  return (
    error instanceof Error && error.message.includes("MAX_WRITE_OPERATIONS")
  );
}

async function setWithQuotaRetry(
  items: Record<string, unknown>,
): Promise<void> {
  let quotaCleanupAttempts = 0;

  for (let attempt = 0; attempt <= WRITE_RATE_RETRY_LIMIT; attempt++) {
    try {
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

      if (
        isQuotaError(error) &&
        quotaCleanupAttempts < QUOTA_CLEANUP_RETRY_LIMIT
      ) {
        quotaCleanupAttempts += 1;
        await cleanupOldVideos(
          STORAGE.CLEANUP_BATCH_SIZE * quotaCleanupAttempts,
        );
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

/**
 * Low-level storage setter
 */
async function storageSet(items: Record<string, unknown>): Promise<void> {
  if (!isExtension) {
    Object.entries(items).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Low-level storage getter for a single key
 */
async function storageGet<T>(key: string): Promise<T | null> {
  if (!isExtension) {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : null;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] ?? null);
    });
  });
}

/**
 * Low-level storage getter for multiple keys
 */
async function storageGetMultiple<T extends Record<string, unknown>>(
  keys: string[],
): Promise<Partial<T>> {
  if (!isExtension) {
    const result: Partial<T> = {};
    keys.forEach((key) => {
      const item = localStorage.getItem(key);
      if (item) {
        (result as any)[key] = JSON.parse(item);
      }
    });
    return result;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Partial<T>);
    });
  });
}

/**
 * Low-level storage remover
 */
async function storageRemove(keys: string[]): Promise<void> {
  if (!isExtension) {
    keys.forEach((key) => localStorage.removeItem(key));
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Low-level storage getter for everything
 */
async function storageGetAll(): Promise<Record<string, unknown>> {
  if (!isExtension) {
    const allItems: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const item = localStorage.getItem(key);
        if (item) allItems[key] = JSON.parse(item);
      }
    }
    return allItems;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (allItems) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(allItems);
      }
    });
  });
}

// ============================================================================
// Video Data Storage
// ============================================================================

export async function getSubtitles(
  videoId: string,
): Promise<SubtitleSegment[] | null> {
  return storageGet<SubtitleSegment[]>(StorageKeys.subtitles(videoId));
}

export async function saveSubtitles(
  videoId: string,
  subtitles: SubtitleSegment[],
): Promise<void> {
  const key = StorageKeys.subtitles(videoId);
  await ensureStorageSpace();
  await setWithQuotaRetry({ [key]: subtitles });
}

export async function getVideoMetadata(
  videoId: string,
): Promise<VideoMetadata | null> {
  return storageGet<VideoMetadata>(StorageKeys.metadata(videoId));
}

export async function saveVideoMetadata(
  videoId: string,
  metadata: VideoMetadata,
): Promise<void> {
  return setWithQuotaRetry({ [StorageKeys.metadata(videoId)]: metadata });
}

export async function getSummary(
  videoId: string,
): Promise<StoredSummary | null> {
  return storageGet<StoredSummary>(StorageKeys.summary(videoId));
}

export async function saveSummary(
  videoId: string,
  summary: any,
  modelUsed: string,
  targetLanguage?: string | null,
  quality?: any,
): Promise<void> {
  const key = StorageKeys.summary(videoId);
  const storedSummary: StoredSummary = {
    summary,
    quality,
    timestamp: Date.now(),
    modelUsed,
    targetLanguage,
  };
  await ensureStorageSpace();
  await setWithQuotaRetry({ [key]: storedSummary });
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

export async function getStorageValues<T extends Record<string, unknown>>(
  keys: string[],
): Promise<Partial<T>> {
  return storageGetMultiple<T>(keys);
}

// ============================================================================
// Storage Cleanup & Usage
// ============================================================================

export async function getStorageUsage(): Promise<StorageUsage> {
  if (!isExtension) {
    return {
      bytesUsed: 0,
      bytesAvailable: STORAGE.QUOTA_BYTES,
      percentageUsed: 0,
    };
  }

  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      const used = bytesInUse || 0;
      resolve({
        bytesUsed: used,
        bytesAvailable: Math.max(0, STORAGE.QUOTA_BYTES - used),
        percentageUsed: (used / STORAGE.QUOTA_BYTES) * 100,
      });
    });
  });
}

type VideoStorageGroup = {
  videoId: string;
  keys: string[];
  summaryTimestamp: number | null;
};

function resolveVideoIdFromStorageKey(
  key: string,
  value: unknown,
): string | null {
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
  return null;
}

function getVideoStorageGroups(
  allItems: Record<string, unknown>,
): VideoStorageGroup[] {
  const groups = new Map<string, VideoStorageGroup>();

  Object.entries(allItems).forEach(([key, value]) => {
    const videoId = resolveVideoIdFromStorageKey(key, value);
    if (!videoId) return;

    if (!groups.has(videoId)) {
      groups.set(videoId, { videoId, keys: [], summaryTimestamp: null });
    }

    const group = groups.get(videoId)!;
    group.keys.push(key);
    if (
      key.startsWith(SUMMARY_KEY_PREFIX) &&
      value &&
      typeof value === "object" &&
      "timestamp" in value
    ) {
      const timestamp = Number((value as any).timestamp);
      if (Number.isFinite(timestamp)) {
        group.summaryTimestamp = timestamp;
      }
    }
  });

  return Array.from(groups.values());
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
      const timeA = a.summaryTimestamp ?? Number.POSITIVE_INFINITY;
      const timeB = b.summaryTimestamp ?? Number.POSITIVE_INFINITY;
      if (timeA !== timeB) return timeA - timeB;
      return a.videoId.localeCompare(b.videoId);
    })
    .slice(0, removeCount);

  const keysToRemove = groupsToRemove.flatMap((group) => group.keys);
  if (keysToRemove.length === 0) return;
  await storageRemove(keysToRemove);
}

async function ensureStorageHeadroom(
  bytesToKeepAvailable: number,
): Promise<void> {
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

  if (usage.bytesUsed > STORAGE.MAX_STORAGE_BYTES) {
    const videosToRemove = Math.ceil(
      (usage.bytesUsed - STORAGE.MAX_STORAGE_BYTES) /
        STORAGE.ESTIMATED_VIDEO_SIZE_BYTES,
    );
    await cleanupOldVideos(videosToRemove);
  }
}
