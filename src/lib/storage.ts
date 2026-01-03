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
  keys: string[]
): Promise<Partial<T>> {
  if (!isExtension) {
    const result: Partial<T> = {};
    keys.forEach(key => {
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
    keys.forEach(key => localStorage.removeItem(key));
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

export async function getStoredSubtitles(videoId: string): Promise<SubtitleSegment[] | null> {
  return storageGet<SubtitleSegment[]>(StorageKeys.subtitles(videoId));
}

export async function saveSubtitles(videoId: string, subtitles: SubtitleSegment[]): Promise<void> {
  const key = StorageKeys.subtitles(videoId);
  try {
    await storageSet({ [key]: subtitles });
  } catch (error) {
    if (error instanceof Error && error.message.includes("QUOTA")) {
      await cleanupOldVideos(STORAGE.CLEANUP_BATCH_SIZE);
      await storageSet({ [key]: subtitles });
    } else {
      throw error;
    }
  }
}

export async function getStoredVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  return storageGet<VideoMetadata>(StorageKeys.metadata(videoId));
}

export async function saveVideoMetadata(videoId: string, metadata: VideoMetadata): Promise<void> {
  return storageSet({ [StorageKeys.metadata(videoId)]: metadata });
}

export async function getStoredAnalysis(videoId: string): Promise<StoredAnalysis | null> {
  return storageGet<StoredAnalysis>(StorageKeys.analysis(videoId));
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
  } catch (error) {
    if (error instanceof Error && error.message.includes("QUOTA")) {
      await cleanupOldVideos(STORAGE.CLEANUP_BATCH_SIZE);
      await storageSet({ [key]: storedAnalysis });
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

async function getVideoRelatedKeys(allItems: Record<string, unknown>): Promise<string[]> {
  return Object.keys(allItems).filter(key => 
    (key.length === YOUTUBE.VIDEO_ID_LENGTH && Array.isArray(allItems[key])) ||
    key.startsWith('video_info_') || 
    key.startsWith('analysis_')
  );
}

async function cleanupOldVideos(countToRemove: number): Promise<void> {
  const allItems = await storageGetAll();
  const videoKeys = await getVideoRelatedKeys(allItems);

  if (videoKeys.length === 0) return;

  const removeCount = videoKeys.length <= countToRemove
    ? Math.max(1, videoKeys.length - STORAGE_CLEANUP.MIN_VIDEOS_TO_KEEP)
    : countToRemove;

  await storageRemove(videoKeys.slice(0, removeCount));
}

export async function ensureStorageSpace(): Promise<void> {
  const usage = await getStorageUsage();

  if (usage.bytesUsed > STORAGE.MAX_STORAGE_BYTES) {
    const videosToRemove = Math.ceil(
      (usage.bytesUsed - STORAGE.MAX_STORAGE_BYTES) / STORAGE.ESTIMATED_VIDEO_SIZE_BYTES
    );
    await cleanupOldVideos(videosToRemove);
  }
}
