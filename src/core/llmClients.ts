/// <reference types="chrome" />

/** Shared LLM client helpers. */

import { ChatOpenAI } from "@langchain/openai";
import { API_ENDPOINTS } from "./constants";
import { getLlmApiKey, getLlmBaseUrl } from "./runtimeConfig";

export async function createLlmClient(
	model: string,
	title: string = "Better YouTube",
): Promise<ChatOpenAI> {
	const apiKey =
		(await getLlmApiKey()) ||
		(typeof process !== "undefined" ? process.env.LLM_API_KEY : null);
	if (!apiKey) throw new Error("LLM API key missing");

	const llmBaseUrl = await getLlmBaseUrl();

	const httpReferer =
		typeof chrome !== "undefined" && chrome.runtime?.getURL
			? chrome.runtime.getURL("")
			: "";

	return new ChatOpenAI({
		model,
		apiKey,
		configuration: {
			baseURL: llmBaseUrl || API_ENDPOINTS.LLM_DEFAULT_BASE_URL,
			defaultHeaders: {
				"HTTP-Referer": httpReferer,
				"X-Title": title,
			},
		},
		temperature: 0.0,
	});
}
