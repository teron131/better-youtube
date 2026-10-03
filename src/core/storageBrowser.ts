/** Adapts Chrome local/session storage, with Web Storage fallbacks for the preview, without deciding cache retention. */

import { STORAGE } from "./constants.ts";

export interface StorageUsage {
  bytesUsed: number;
  bytesAvailable: number;
  percentageUsed: number;
}

interface StorageArea {
  get<T>(key: string): Promise<T | null>;
  getMultiple<T extends Record<string, unknown>>(keys: string[]): Promise<Partial<T>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const isExtension = typeof chrome !== "undefined" && !!chrome.storage?.local;
const hasSessionStorageApi = typeof chrome !== "undefined" && !!chrome.storage?.session;

export const localArea = createStorageArea(
  isExtension ? () => chrome.storage.local : null,
  () => localStorage,
);
export const sessionArea = createStorageArea(
  hasSessionStorageApi ? () => chrome.storage.session : null,
  () => sessionStorage,
);

/**
 * Low-level storage getter for everything
 */
export async function storageGetAll(): Promise<Record<string, unknown>> {
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

/** Reads resolve without `lastError` checks, matching Chrome's empty results; writes and removals reject on it. */
function createStorageArea(
  getArea: (() => chrome.storage.StorageArea) | null,
  getWebStorage: () => Storage,
): StorageArea {
  if (!getArea) {
    const read = (key: string) => {
      const item = getWebStorage().getItem(key);
      return item ? JSON.parse(item) : null;
    };
    return {
      get: async (key) => read(key),
      getMultiple: async <T extends Record<string, unknown>>(keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          const value = read(key);
          if (value !== null) result[key] = value;
        }
        return result as Partial<T>;
      },
      set: async (items) => {
        for (const [key, value] of Object.entries(items)) {
          getWebStorage().setItem(key, JSON.stringify(value));
        }
      },
      remove: async (keys) => {
        for (const key of keys) getWebStorage().removeItem(key);
      },
    };
  }

  const settle = (resolve: () => void, reject: (error: Error) => void) => () => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else resolve();
  };
  return {
    get: (key) =>
      new Promise((resolve) => getArea().get([key], (result) => resolve(result[key] ?? null))),
    getMultiple: <T extends Record<string, unknown>>(keys: string[]) =>
      new Promise<Partial<T>>((resolve) =>
        getArea().get(keys, (result) => resolve(result as Partial<T>)),
      ),
    set: (items) => new Promise((resolve, reject) => getArea().set(items, settle(resolve, reject))),
    remove: (keys) =>
      new Promise((resolve, reject) => getArea().remove(keys, settle(resolve, reject))),
  };
}
