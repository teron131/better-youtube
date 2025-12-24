/**
 * Chrome Extension API Utilities
 * Standardized wrappers for Chrome API operations with consistent error handling
 */

/**
 * Send a message to the Chrome runtime and wait for response
 * @param message - Message object to send
 * @param timeout - Optional timeout in milliseconds
 * @returns Promise resolving to the response
 * @throws Error if chrome.runtime.lastError occurs or timeout is reached
 *
 * @example
 * const result = await sendChromeMessage({
 *   action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
 *   videoId: "abc123"
 * });
 */
export async function sendChromeMessage<T = any>(
  message: any,
  timeout?: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;

    chrome.runtime.sendMessage(message, (response) => {
      if (timeoutId) clearTimeout(timeoutId);
      chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(response);
    });

    if (timeout) {
      timeoutId = setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);
    }
  });
}

/**
 * Send a message to a specific tab
 * @param tabId - Tab ID to send message to
 * @param message - Message object to send
 * @returns Promise resolving to the response
 * @throws Error if chrome.runtime.lastError occurs
 *
 * @example
 * const result = await sendTabMessage(tabId, {
 *   action: MESSAGE_ACTIONS.TOGGLE_SUBTITLES
 * });
 */
export async function sendTabMessage<T = any>(
  tabId: number,
  message: any
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(response);
    });
  });
}

/**
 * Create a message listener with automatic cleanup
 * @param handler - Message handler function
 * @returns Cleanup function to remove the listener
 *
 * @example
 * const removeListener = createMessageListener((message, sender, sendResponse) => {
 *   if (message.action === 'something') {
 *     sendResponse({ status: 'ok' });
 *     return true; // Keep channel open
 *   }
 * });
 *
 * // Later: removeListener();
 */
export function createMessageListener(
  handler: (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => boolean | void
): () => void {
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

/**
 * Helper to check if Chrome runtime context is valid
 * @returns True if context is valid
 *
 * @example
 * if (!isChromeContextValid()) {
 *   console.error('Extension context invalidated');
 *   return;
 * }
 */
export function isChromeContextValid(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}
