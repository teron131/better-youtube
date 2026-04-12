/// <reference types="chrome" />

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
							new Error(
								`Message timeout after ${timeout}ms${actionName ? `: ${actionName}` : ""}`,
							),
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

/**
 * Send a message to the Chrome runtime and wait for response
 */
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

/**
 * Send a message to a specific tab
 */
export async function sendTabMessage<T = any>(
	tabId: number,
	message: ChromeMessage,
): Promise<T> {
	return sendMessageInternal<T>((callback) =>
		chrome.tabs.sendMessage(tabId, message, callback),
	);
}

/**
 * Create a message listener with automatic cleanup
 */
export function createMessageListener(
	handler: (
		message: ChromeMessage,
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: any) => void,
	) => boolean | void,
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
