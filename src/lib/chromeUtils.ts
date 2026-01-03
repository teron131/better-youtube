/**
 * Chrome Extension API Utilities
 * Standardized wrappers for Chrome API operations with consistent error handling
 */

/**
 * Common message structure for internal communication
 */
export interface ChromeMessage<T = any> {
  action: string;
  payload?: T;
  [key: string]: any;
}

/**
 * Send a message to the Chrome runtime and wait for response
 */
export async function sendChromeMessage<T = any>(
  message: ChromeMessage,
  timeout?: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: any;

    if (timeout) {
      timeoutId = setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms: ${message.action}`));
      }, timeout);
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Send a message to a specific tab
 */
export async function sendTabMessage<T = any>(
  tabId: number,
  message: ChromeMessage
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Create a message listener with automatic cleanup
 */
export function createMessageListener(
  handler: (
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => boolean | void
): () => void {
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

/**
 * Helper to check if Chrome runtime context is valid
 */
export function isChromeContextValid(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Get the currently active tab in the current window
 */
export async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

/**
 * Open the extension settings page
 */
export function openSettings(): void {
  chrome.runtime.openOptionsPage();
}
