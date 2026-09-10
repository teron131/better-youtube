/** Adapts Chrome local/session storage and web-preview storage without deciding cache retention. */

import { STORAGE } from "./constants.ts";

export interface StorageUsage {
  bytesUsed: number;
  bytesAvailable: number;
  percentageUsed: number;
}

const isExtension = typeof chrome !== "undefined" && !!chrome.storage?.local;
const hasSessionStorageApi = typeof chrome !== "undefined" && !!chrome.storage?.session;

/**
 * Low-level storage setter
 */
export async function storageSet(items: Record<string, unknown>): Promise<void> {
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
export async function storageGet<T>(key: string): Promise<T | null> {
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
export async function storageGetMultiple<T extends Record<string, unknown>>(
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
export async function storageRemove(keys: string[]): Promise<void> {
  if (!isExtension) {
    keys.forEach((key) => {
      localStorage.removeItem(key);
    });
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

export async function sessionStorageSet(items: Record<string, unknown>): Promise<void> {
  if (!hasSessionStorageApi) {
    Object.entries(items).forEach(([key, value]) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    });
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.session.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function sessionStorageGet<T>(key: string): Promise<T | null> {
  if (!hasSessionStorageApi) {
    const item = sessionStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : null;
  }

  return new Promise((resolve) => {
    chrome.storage.session.get([key], (result) => {
      resolve(result[key] ?? null);
    });
  });
}

export async function sessionStorageGetMultiple<T extends Record<string, unknown>>(
  keys: string[],
): Promise<Partial<T>> {
  if (!hasSessionStorageApi) {
    const result: Partial<T> = {};
    keys.forEach((key) => {
      const item = sessionStorage.getItem(key);
      if (item) {
        (result as Record<string, unknown>)[key] = JSON.parse(item);
      }
    });
    return result;
  }

  return new Promise((resolve) => {
    chrome.storage.session.get(keys, (result) => {
      resolve(result as Partial<T>);
    });
  });
}

export async function sessionStorageRemove(keys: string[]): Promise<void> {
  if (!hasSessionStorageApi) {
    keys.forEach((key) => {
      sessionStorage.removeItem(key);
    });
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(keys, () => {
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
