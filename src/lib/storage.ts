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
  upload_date: string | null;
  view_count: number | null;
  like_count: number | null;
}

export interface StoredAnalysis {
  analysis: any;
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
  analysis: (videoId: string) => `analysis_${videoId}`,
} as const;

// ============================================================================
// Core Storage Operations
// ============================================================================

const isExtension = typeof chrome !== "undefined" && !!chrome.storage?.local;

async function storageSet(items: Record<string, unknown>): Promise<void> {
  if (!isExtension) {
    for (const [key, value] of Object.entries(items)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    return;
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve();
    });
  });
}

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

async function storageGetMultiple<T extends Record<string, unknown>>(
  keys: string[]
): Promise<Partial<T>> {
  if (!isExtension) {
    const result: Partial<T> = {};
    for (const key of keys) {
      const item = localStorage.getItem(key);
      if (item) {
        (result as Record<string, unknown>)[key] = JSON.parse(item);
      }
    }
    return result;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Partial<T>);
    });
  });
}

async function storageRemove(keys: string[]): Promise<void> {
  if (!isExtension) {
    keys.forEach(key => localStorage.removeItem(key));
    return;
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve();
    });
  });
}

async function storageGetAll(): Promise<Record<string, unknown>> {
  if (!isExtension) {
    const allItems: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const item = localStorage.getItem(key);
        if (item) {
          allItems[key] = JSON.parse(item);
        }
      }
    }
    return allItems;
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (allItems) => {
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(allItems);
    });
  });
}

// ============================================================================
// Video Data Storage
// ============================================================================

export async function getStoredSubtitles(videoId: string): Promise<SubtitleSegment[] | null> {
  const key = StorageKeys.subtitles(videoId);
  return storageGet<SubtitleSegment[]>(key);
}

export async function saveSubtitles(videoId: string, subtitles: SubtitleSegment[]): Promise<void> {
  const key = StorageKeys.subtitles(videoId);
  try {
    await storageSet({ [key]: subtitles });
    console.log(`Subtitles saved for video: ${videoId}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("QUOTA")) {
      console.warn("Storage quota exceeded, cleaning up...");
      await cleanupOldVideos(STORAGE.CLEANUP_BATCH_SIZE);
      await storageSet({ [key]: subtitles });
      console.log(`Subtitles saved after cleanup: ${videoId}`);
    } else {
      throw error;
    }
  }
}

export async function getStoredVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  const key = StorageKeys.metadata(videoId);
  return storageGet<VideoMetadata>(key);
}

export async function saveVideoMetadata(videoId: string, metadata: VideoMetadata): Promise<void> {
  const key = StorageKeys.metadata(videoId);
  await storageSet({ [key]: metadata });
  console.log(`Video metadata saved: ${videoId}`);
}

export async function getStoredAnalysis(videoId: string): Promise<StoredAnalysis | null> {
  const key = StorageKeys.analysis(videoId);
  return storageGet<StoredAnalysis>(key);
}

export async function saveAnalysis(
  videoId: string,
  analysis: any,
  modelUsed: string,
  targetLanguage?: string | null,
  quality?: any
): Promise<void> {
  const key = StorageKeys.analysis(videoId);
  const storedAnalysis: StoredAnalysis = {
    analysis,
    quality,
    timestamp: Date.now(),
    modelUsed,
    targetLanguage,
  };

  try {
    await storageSet({ [key]: storedAnalysis });
    console.log(`Analysis saved: ${videoId}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("QUOTA")) {
      console.warn("Storage quota exceeded, cleaning up...");
      await cleanupOldVideos(STORAGE.CLEANUP_BATCH_SIZE);
      await storageSet({ [key]: storedAnalysis });
      console.log(`Analysis saved after cleanup: ${videoId}`);
    } else {
      throw error;
    }
  }
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
  keys: string[]
): Promise<Partial<T>> {
  return storageGetMultiple<T>(keys);
}

// ============================================================================
// Storage Cleanup
// ============================================================================

export async function getStorageUsage(): Promise<StorageUsage> {
  if (!isExtension) {
    return Promise.resolve({
      bytesUsed: 0,
      bytesAvailable: STORAGE.QUOTA_BYTES,
      percentageUsed: 0,
    });
  }

  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      resolve({
        bytesUsed: bytesInUse || 0,
        bytesAvailable: STORAGE.QUOTA_BYTES - (bytesInUse || 0),
        percentageUsed: ((bytesInUse || 0) / STORAGE.QUOTA_BYTES) * 100,
      });
    });
  });
}

async function getVideoRelatedKeys(allItems: Record<string, unknown>): Promise<string[]> {
  const keys: string[] = [];
  for (const key of Object.keys(allItems)) {
    if ((key.length === YOUTUBE.VIDEO_ID_LENGTH && Array.isArray(allItems[key])) ||
        key.startsWith('video_info_') || key.startsWith('analysis_')) {
      keys.push(key);
    }
  }
  return keys;
}

async function cleanupOldVideos(countToRemove: number): Promise<void> {
  const allItems = await storageGetAll();
  const videoKeys = await getVideoRelatedKeys(allItems);

  if (videoKeys.length === 0) {
    console.log("No video data to clean up");
    return;
  }

  const removeCount =
    videoKeys.length <= countToRemove
      ? Math.max(1, videoKeys.length - STORAGE_CLEANUP.MIN_VIDEOS_TO_KEEP)
      : countToRemove;

  const keysToRemove = videoKeys.slice(0, removeCount);
  await storageRemove(keysToRemove);
  console.log(`Cleaned up ${keysToRemove.length} video data entries`);
}

export async function ensureStorageSpace(): Promise<void> {
  const usage = await getStorageUsage();

  if (usage.bytesUsed > STORAGE.MAX_STORAGE_BYTES) {
    console.log(`Storage at ${usage.percentageUsed.toFixed(1)}%, cleaning up...`);
    const videosToRemove = Math.ceil(
      (usage.bytesUsed - STORAGE.MAX_STORAGE_BYTES) / STORAGE.ESTIMATED_VIDEO_SIZE_BYTES
    );
    await cleanupOldVideos(videosToRemove);
  }
}
