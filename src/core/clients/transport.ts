/// <reference types="chrome" />

/** Removes SDK-generated browser-blocked headers while preserving request headers and cancellation. */

const BROWSER_BLOCKED_OPENAI_HEADERS = [
  "user-agent",
  "x-stainless-arch",
  "x-stainless-lang",
  "x-stainless-os",
  "x-stainless-package-version",
  "x-stainless-retry-count",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
  "x-stainless-timeout",
] as const;

export function isBrowserRuntime(): boolean {
  if (typeof fetch !== "function") return false;
  if (typeof navigator !== "undefined") return true;
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export function createBrowserSafeOpenAiFetch(): typeof fetch {
  return async (input, init) => {
    const headers = input instanceof Request ? new Headers(input.headers) : new Headers();
    const overrideHeaders = new Headers(init?.headers);

    overrideHeaders.forEach((value, key) => {
      headers.set(key, value);
    });

    for (const headerName of BROWSER_BLOCKED_OPENAI_HEADERS) {
      headers.delete(headerName);
    }

    const nextInit: RequestInit = {
      ...init,
      headers,
    };

    if (input instanceof Request) {
      return fetch(new Request(input, nextInit));
    }

    return fetch(input, nextInit);
  };
}
