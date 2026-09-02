/** Verify aggregate model scoring through the same metadata boundary used by the sidepanel. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchModelSelectorMetadataIndex,
  normalizeOpenRouterModelId,
} from "../src/sidepanel/services/stats.ts";

const EPOCH_URL = "https://epoch.ai/data/eci_scores.csv";
const SURGE_URL = "https://surgehq.ai/benchmarks";
const OPENROUTER_CATALOG_URL = "https://openrouter.ai/api/frontend/v1/catalog/models";
const MODEL_A = "openai/model-a";
const MODEL_B = "openai/model-b";

test("normalizes OpenRouter variants and the xAI provider alias", () => {
  assert.equal(normalizeOpenRouterModelId(" OpenAI/GPT-5:free "), "openai/gpt-5");
  assert.equal(normalizeOpenRouterModelId("xai/grok-4"), "x-ai/grok-4");
});

test("builds selector scores and effective prices from aggregate public evidence", async () => {
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === EPOCH_URL) {
      return new Response(
        "Model,Display name,eci\nopenai/model-a,Model A,100\nopenai/model-b,Model B,0\n",
      );
    }
    if (url === SURGE_URL) {
      return new Response(
        '<article id="intelligence-index"><div data-ii-item><span data-ii-model-bound>model-a</span><span data-ii-score-paragraph>0</span></div><div data-ii-item><span data-ii-model-bound>model-b</span><span data-ii-score-paragraph>100</span></div><div data-ii-status></div></article>',
      );
    }
    if (url === OPENROUTER_CATALOG_URL) {
      return Response.json({
        data: [
          { slug: MODEL_A, permaslug: MODEL_A },
          { slug: MODEL_B, permaslug: MODEL_B },
        ],
      });
    }
    if (url.includes("openrouter.ai/api/frontend/v1/stats/")) {
      return openRouterStatsResponse(url);
    }
    return new Response("");
  };

  const index = await fetchModelSelectorMetadataIndex([MODEL_A, MODEL_B]);

  assert.deepEqual(index.modelsById[MODEL_A], {
    intelligenceScore: 51.61,
    speedMetric: 100,
    price: 1.5,
  });
  assert.deepEqual(index.modelsById[MODEL_B], {
    intelligenceScore: 48.39,
    speedMetric: 0,
    price: 1.5,
  });
  assert.ok(requestedUrls.some((url) => url.includes("artificialanalysis.ai")));
  assert.ok(requestedUrls.some((url) => url.includes("vals.ai")));
  assert.ok(requestedUrls.some((url) => url.includes("surgehq.ai")));
  assert.ok(requestedUrls.some((url) => url.includes("throughput-comparison")));
});

test("quietly falls back when every optional score source fails", async () => {
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  const index = await fetchModelSelectorMetadataIndex([MODEL_A]);

  assert.deepEqual(index, { modelsById: {} });
});

function openRouterStatsResponse(url: string): Response {
  const modelId = new URL(url).searchParams.get("permaslug");
  const isFastModel = modelId === MODEL_A;
  const endpointId = isFastModel ? "endpoint-a" : "endpoint-b";
  if (url.includes("effective-pricing")) {
    return Response.json({
      data: {
        providerSummaries: [
          {
            providerName: "Provider",
            totalTokens: 100,
            effectiveInputPrice: 1,
            effectiveOutputPrice: 2,
          },
        ],
      },
    });
  }
  if (url.includes("/endpoint?")) {
    return Response.json({
      data: [
        {
          id: endpointId,
          provider_display_name: "Provider",
          stats: {
            p50_throughput: isFastModel ? 100 : 10,
            p50_latency: isFastModel ? 100 : 1000,
            request_count: 10,
          },
        },
      ],
    });
  }
  const highIsFavorable = url.includes("throughput-comparison");
  const value = isFastModel === highIsFavorable ? 100 : 10;
  return Response.json({ data: [{ y: { [`${endpointId}::default`]: value } }] });
}
