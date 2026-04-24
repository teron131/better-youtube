/// <reference types="chrome" />

/** Host permission helpers for user-provided OpenAI-compatible endpoints. */

export type LlmHostPermissionStatus =
	| "granted"
	| "invalid"
	| "not-needed"
	| "unavailable"
	| "denied";

function hasChromePermissionsApi(): boolean {
	return (
		typeof chrome !== "undefined" &&
		Boolean(chrome.runtime?.id) &&
		Boolean(chrome.permissions?.contains) &&
		Boolean(chrome.permissions?.request)
	);
}

function resolveLastError(): Error | null {
	const message = chrome.runtime.lastError?.message;
	return message ? new Error(message) : null;
}

function containsHostPermission(origin: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		chrome.permissions.contains({ origins: [origin] }, (hasPermission) => {
			const error = resolveLastError();
			if (error) {
				reject(error);
				return;
			}
			resolve(hasPermission);
		});
	});
}

function requestHostPermission(origin: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		chrome.permissions.request({ origins: [origin] }, (wasGranted) => {
			const error = resolveLastError();
			if (error) {
				reject(error);
				return;
			}
			resolve(wasGranted);
		});
	});
}

export function createLlmHostPermissionPattern(baseUrl: string): string | null {
	const trimmedBaseUrl = baseUrl.trim();
	if (!trimmedBaseUrl) return null;

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(trimmedBaseUrl);
	} catch {
		return null;
	}

	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		return null;
	}

	return `${parsedUrl.protocol}//${parsedUrl.hostname}/*`;
}

export async function ensureLlmBaseUrlHostPermission(
	baseUrl: string,
): Promise<LlmHostPermissionStatus> {
	const origin = createLlmHostPermissionPattern(baseUrl);
	if (!origin) return baseUrl.trim() ? "invalid" : "not-needed";
	if (!hasChromePermissionsApi()) return "unavailable";

	if (await containsHostPermission(origin)) return "granted";
	return (await requestHostPermission(origin)) ? "granted" : "denied";
}
