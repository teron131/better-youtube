/** Checks shared client routing and browser-safe request transport without contacting a provider. */

import assert from "node:assert/strict";
import test from "node:test";

import { resolveLlmConnection } from "../src/core/clients/config.ts";
import { createBrowserSafeOpenAiFetch } from "../src/core/clients/transport.ts";
import { API_ENDPOINTS } from "../src/core/constants.ts";

test("client configuration preserves endpoint selection and request model identity", () => {
  assert.deepEqual(
    resolveLlmConnection(" provider/model ", {
      llmApiKey: "test-key",
      llmBaseUrl: "https://example.invalid/v1",
      llmModelPrefixMode: "none",
    }),
    { model: "model", apiKey: "test-key", baseURL: "https://example.invalid/v1" },
  );
  assert.deepEqual(
    resolveLlmConnection(" provider/model ", {
      llmApiKey: "test-key",
      llmBaseUrl: null,
      llmModelPrefixMode: "provider",
    }),
    { model: "provider/model", apiKey: "test-key", baseURL: API_ENDPOINTS.LLM_DEFAULT_BASE_URL },
  );
  assert.throws(
    () =>
      resolveLlmConnection("model", {
        llmApiKey: null,
        llmBaseUrl: null,
        llmModelPrefixMode: "none",
      }),
    /API key missing/,
  );
});

test("browser transport strips SDK headers while retaining auth, overrides, body, and cancellation", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let captured: Request;
  globalThis.fetch = async (input, init) => {
    captured = input instanceof Request ? input : new Request(input, init);
    return new Response("ok");
  };
  try {
    const request = new Request("https://example.invalid/v1/chat/completions", {
      method: "POST",
      body: "{}",
      signal: controller.signal,
      headers: {
        authorization: "Bearer test-key",
        "user-agent": "SDK",
        "x-stainless-runtime": "node",
        "x-custom": "original",
      },
    });
    await createBrowserSafeOpenAiFetch()(request, { headers: { "x-custom": "override" } });
    assert.equal(captured!.headers.get("authorization"), "Bearer test-key");
    assert.equal(captured!.headers.get("x-custom"), "override");
    assert.equal(captured!.headers.has("user-agent"), false);
    assert.equal(captured!.headers.has("x-stainless-runtime"), false);
    assert.equal(await captured!.text(), "{}");
    controller.abort();
    assert.equal(captured!.signal.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
