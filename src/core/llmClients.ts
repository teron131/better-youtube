/// <reference types="chrome" />

/** Shared LLM client helpers. */

import { ChatOpenAI } from "@langchain/openai";
import { API_ENDPOINTS } from "./constants";
import { loadRuntimeConfigSnapshot } from "./runtimeConfig";

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

function isBrowserRuntime(): boolean {
	if (typeof fetch !== "function") return false;
	if (typeof navigator !== "undefined") return true;
	return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function createBrowserSafeOpenAiFetch(): typeof fetch {
	return async (input, init) => {
		const headers =
			input instanceof Request ? new Headers(input.headers) : new Headers();
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

export async function createLlmClient(
	model: string,
	title: string = "Better YouTube",
): Promise<ChatOpenAI> {
	const runtimeConfig = await loadRuntimeConfigSnapshot();
	const apiKey =
		runtimeConfig.llmApiKey ||
		(typeof process !== "undefined" ? process.env.LLM_API_KEY : null);
	if (!apiKey) throw new Error("LLM API key missing");

	const llmBaseUrl = runtimeConfig.llmBaseUrl;
	const browserRuntime = isBrowserRuntime();

	return new ChatOpenAI({
		model,
		apiKey,
		configuration: {
			baseURL: llmBaseUrl || API_ENDPOINTS.LLM_DEFAULT_BASE_URL,
			...(browserRuntime
				? { fetch: createBrowserSafeOpenAiFetch() }
				: {
						defaultHeaders: {
							"X-Title": title,
						},
					}),
		},
		temperature: 0.0,
	});
}
