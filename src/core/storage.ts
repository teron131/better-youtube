/**
 * Chrome storage management
 */

import { STORAGE, STORAGE_CLEANUP, YOUTUBE } from "./constants";

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

function isQuotaError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("QUOTA");
}

function isWriteRateQuotaError(error: unknown): error is Error {
  return (
    error instanceof Error && error.message.includes("MAX_WRITE_OPERATIONS")
  );
}

async function setWithQuotaRetry(
  items: Record<string, unknown>,
): Promise<void> {
  try {
    await storageSet(items);
  } catch (error) {
    if (isWriteRateQuotaError(error)) {
      throw error;
    }
    if (!isQuotaError(error)) {
      throw error;
    }
    await cleanupOldVideos(STORAGE.CLEANUP_BATCH_SIZE);
    await storageSet(items);
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
  return storageSet({ [StorageKeys.metadata(videoId)]: metadata });
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
  await setWithQuotaRetry({ [key]: storedSummary });
}

// ============================================================================
// Settings Storage
// ============================================================================

export async function getStorageValue<T>(key: string): Promise<T | null> {
  return storageGet<T>(key);
}

export async function setStorageValue<T>(key: string, value: T): Promise<void> {
  return storageSet({ [key]: value });
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

function getVideoRelatedKeys(allItems: Record<string, unknown>): string[] {
  return Object.keys(allItems).filter(
    (key) =>
      (key.length === YOUTUBE.VIDEO_ID_LENGTH &&
        Array.isArray(allItems[key])) ||
      key.startsWith("video_info_") ||
      key.startsWith("summary_"),
  );
}

async function cleanupOldVideos(countToRemove: number): Promise<void> {
  const allItems = await storageGetAll();
  const videoKeys = getVideoRelatedKeys(allItems);

  if (videoKeys.length === 0) return;

  const removeCount =
    videoKeys.length <= countToRemove
      ? Math.max(1, videoKeys.length - STORAGE_CLEANUP.MIN_VIDEOS_TO_KEEP)
      : countToRemove;

  await storageRemove(videoKeys.slice(0, removeCount));
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
