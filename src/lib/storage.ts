/**
 * Chrome storage management for subtitles, video info, and settings
 */

import { STORAGE, YOUTUBE, STORAGE_CLEANUP } from "./constants";

export interface SubtitleSegment {
  text: string;
  startTime: number;
  endTime: number;
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

/**
 * Get video metadata storage key
 */
function getVideoMetadataKey(videoId: string): string {
  return `video_info_${videoId}`;
}

/**
 * Get video metadata from local storage
 */
export function getStoredVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    const key = getVideoMetadataKey(videoId);
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] || null);
    });
  });
}

/**
 * Save video metadata to local storage
 */
export async function saveVideoMetadata(videoId: string, metadata: VideoMetadata): Promise<void> {
  const key = getVideoMetadataKey(videoId);
  await chromeStorageSet({ [key]: metadata });
  console.log("Video metadata saved for video ID:", videoId);
}

/**
 * Get subtitles for a video from local storage
 */
export function getStoredSubtitles(videoId: string): Promise<SubtitleSegment[] | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([videoId], (result) => {
      resolve(result[videoId] || null);
    });
  });
}

/**
 * Save subtitles for a video to local storage
 */
export async function saveSubtitles(videoId: string, subtitles: SubtitleSegment[]): Promise<void> {
  try {
    await chromeStorageSet({ [videoId]: subtitles });
    console.log("Subtitles saved to local storage for video ID:", videoId);
  } catch (error) {
    if (error instanceof Error && error.message?.includes("QUOTA")) {
      console.warn("Storage quota exceeded, attempting cleanup...");
      await cleanupOldSubtitles(STORAGE.CLEANUP_BATCH_SIZE);
      await chromeStorageSet({ [videoId]: subtitles });
      console.log("Subtitles saved after cleanup for video:", videoId);
    } else {
      throw error;
    }
  }
}

/**
 * Wrapper for chrome.storage.local.set with promise interface
 */
function chromeStorageSet(items: Record<string, unknown>): Promise<void> {
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

export interface StorageUsage {
  bytesUsed: number;
  bytesAvailable: number;
  percentageUsed: number;
}

/**
 * Get storage usage information
 */
export function getStorageUsage(): Promise<StorageUsage> {
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

/**
 * Clean up old subtitles when storage is full
 */
export async function cleanupOldSubtitles(countToRemove = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (allItems) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const videoKeys = getVideoKeys(allItems);
      const keysToRemove = selectKeysToRemove(videoKeys, countToRemove);

      chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log(`Removed ${keysToRemove.length} old video transcripts`);
          resolve();
        }
      });
    });
  });
}

/**
 * Get all video keys from storage items
 */
function getVideoKeys(allItems: Record<string, unknown>): string[] {
  return Object.keys(allItems).filter(
    (key) => key.length === YOUTUBE.VIDEO_ID_LENGTH && Array.isArray(allItems[key])
  );
}

/**
 * Select which keys to remove during cleanup
 */
function selectKeysToRemove(videoKeys: string[], countToRemove: number): string[] {
  const removeCount =
    videoKeys.length <= countToRemove
      ? Math.max(1, videoKeys.length - STORAGE_CLEANUP.MIN_VIDEOS_TO_KEEP)
      : countToRemove;

  return videoKeys.slice(0, removeCount);
}

/**
 * Proactively check and clean storage if nearing limit
 */
export async function ensureStorageSpace(): Promise<void> {
  const usage = await getStorageUsage();

  if (usage.bytesUsed > STORAGE.MAX_STORAGE_BYTES) {
    console.log(`Storage usage at ${usage.percentageUsed.toFixed(1)}%, cleaning up...`);
    const videosToRemove = Math.ceil(
      (usage.bytesUsed - STORAGE.MAX_STORAGE_BYTES) / STORAGE.ESTIMATED_VIDEO_SIZE_BYTES
    );
    await cleanupOldSubtitles(videosToRemove);
  }
}

/**
 * Get value from storage
 */
export function getStorageValue<T>(keyName: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([keyName], (result) => {
      resolve(result[keyName] ?? null);
    });
  });
}

/**
 * Get API key from storage
 */
export const getApiKeyFromStorage = getStorageValue;

/**
 * Save value to storage
 */
export function setStorageValue<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Save setting to storage (synchronous callback-based)
 */
export function saveSetting(key: string, value: unknown): void {
  chrome.storage.local.set({ [key]: value }, () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to save setting:", key, chrome.runtime.lastError);
    } else {
      console.log("Auto-saved:", key, value);
    }
  });
}

/**
 * Get multiple values from storage
 */
export function getStorageValues<T extends Record<string, unknown>>(
  keys: string[]
): Promise<Partial<T>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Partial<T>);
    });
  });
}
