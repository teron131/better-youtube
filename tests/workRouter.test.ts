import assert from "node:assert/strict";
import test from "node:test";

import { resolveSummarizationRoute } from "../src/core/workRouter.ts";

test("auto route prioritizes LLM when both keys are available", () => {
	const route = resolveSummarizationRoute({
		requestedProvider: "auto",
		requestedMode: "validation",
		summarizerModel: "google/gemini-3-flash",
		hasGeminiKey: true,
		hasLlmKey: true,
	});

	assert.equal(route.provider, "llm");
	assert.equal(route.llmMode, "react");
});

test("auto route falls back to Gemini when LLM is unavailable", () => {
	const route = resolveSummarizationRoute({
		requestedProvider: "auto",
		requestedMode: "validation",
		summarizerModel: "google/gemini-3-flash",
		hasGeminiKey: true,
		hasLlmKey: false,
	});

	assert.equal(route.provider, "gemini");
});

test("native mode still requires Gemini", () => {
	const route = resolveSummarizationRoute({
		requestedProvider: "auto",
		requestedMode: "native",
		summarizerModel: "google/gemini-3-flash",
		hasGeminiKey: true,
		hasLlmKey: true,
	});

	assert.equal(route.provider, "gemini");
	assert.equal(route.llmMode, undefined);
});

test("explicit LLM provider is not overridden by native mode", () => {
	const route = resolveSummarizationRoute({
		requestedProvider: "llm",
		requestedMode: "native",
		summarizerModel: "google/gemini-3-flash",
		hasGeminiKey: true,
		hasLlmKey: true,
	});

	assert.equal(route.provider, "llm");
	assert.equal(route.modePreference, "validation");
	assert.equal(route.llmMode, "react");
});
