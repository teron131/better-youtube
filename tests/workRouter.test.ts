import assert from "node:assert/strict";
import test from "node:test";

import { resolveSummarizationRoute } from "../src/core/workRouter.ts";

test("auto route prioritizes LLM when both keys are available", () => {
  const route = resolveSummarizationRoute({
    requestedProvider: "auto",
    summarizerModel: "google/gemini-3-flash",
    hasGeminiKey: true,
    hasLlmKey: true,
  });

  assert.equal(route.provider, "llm");
});

test("auto route falls back to Gemini when LLM is unavailable", () => {
  const route = resolveSummarizationRoute({
    requestedProvider: "auto",
    summarizerModel: "google/gemini-3-flash",
    hasGeminiKey: true,
    hasLlmKey: false,
  });

  assert.equal(route.provider, "gemini");
});

test("auto route rejects missing provider keys", () => {
  assert.throws(
    () =>
      resolveSummarizationRoute({
        requestedProvider: "auto",
        summarizerModel: "google/gemini-3-flash",
        hasGeminiKey: false,
        hasLlmKey: false,
      }),
    /No valid summarizer provider/,
  );
});

test("explicit Gemini falls back to LLM for a non-Gemini model", () => {
  const route = resolveSummarizationRoute({
    requestedProvider: "gemini",
    summarizerModel: "openai/example",
    hasGeminiKey: true,
    hasLlmKey: true,
  });

  assert.equal(route.provider, "llm");
});

test("explicit Gemini provider takes precedence when usable", () => {
  const route = resolveSummarizationRoute({
    requestedProvider: "gemini",
    summarizerModel: "google/gemini-3-flash",
    hasGeminiKey: true,
    hasLlmKey: true,
  });

  assert.equal(route.provider, "gemini");
});

test("explicit LLM provider takes precedence when usable", () => {
  const route = resolveSummarizationRoute({
    requestedProvider: "llm",
    summarizerModel: "google/gemini-3-flash",
    hasGeminiKey: true,
    hasLlmKey: true,
  });

  assert.equal(route.provider, "llm");
});
