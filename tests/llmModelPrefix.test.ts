import assert from "node:assert/strict";
import test from "node:test";

import { resolveLlmRequestModel } from "../src/core/llmModelPrefix.ts";

test("provider prefix mode preserves the selected model id", () => {
	assert.equal(
		resolveLlmRequestModel("openai/gpt-5.4-nano", "provider", "opencode"),
		"openai/gpt-5.4-nano",
	);
});

test("none prefix mode strips the selected provider prefix", () => {
	assert.equal(
		resolveLlmRequestModel("openai/gpt-5.4-nano", "none", "opencode"),
		"gpt-5.4-nano",
	);
});

test("custom prefix mode replaces the selected provider prefix", () => {
	assert.equal(
		resolveLlmRequestModel("openai/gpt-5.4-nano", "custom", "opencode"),
		"opencode/gpt-5.4-nano",
	);
});

test("custom prefix mode trims slashes from the prefix", () => {
	assert.equal(
		resolveLlmRequestModel("gpt-5.4-nano", "custom", "/opencode/"),
		"opencode/gpt-5.4-nano",
	);
});
