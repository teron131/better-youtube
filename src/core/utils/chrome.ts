/// <reference types="chrome" />

/** Promise wrappers over Chrome runtime messaging and tab lookup; message sends reject on `chrome.runtime.lastError` or an optional timeout. */

export interface ChromeMessage<T = unknown> {
  action: string;
  payload?: T;
  [key: string]: unknown;
}

function sendMessageInternal<T>(
  send: (callback: (response: T) => void) => void,
  timeout?: number,
  actionName?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId =
      timeout == null
        ? null
        : setTimeout(() => {
            reject(
              new Error(`Message timeout after ${timeout}ms${actionName ? `: ${actionName}` : ""}`),
            );
          }, timeout);

    const finish = (fn: () => void) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      fn();
    };

    try {
      send((response) => {
        if (chrome.runtime.lastError) {
          finish(() => reject(new Error(chrome.runtime.lastError.message)));
          return;
        }
        finish(() => resolve(response));
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

/** A message no listener answers also rejects; `timeout` is in milliseconds, and leaving it unset means no deadline. */
export async function sendChromeMessage<T = any>(
  message: ChromeMessage,
  timeout?: number,
): Promise<T> {
  return sendMessageInternal<T>(
    (callback) => chrome.runtime.sendMessage(message, callback),
    timeout,
    message.action,
  );
}

/** Registers the handler immediately; the returned function removes it. */
export function createMessageListener(
  handler: (
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => boolean | undefined,
): () => void {
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

/** False outside the extension, such as in the Vite preview, and in a content script orphaned by an extension reload or update. */
export function isChromeContextValid(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

export async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}
