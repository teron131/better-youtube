/** Fetch token-weighted OpenRouter pricing and performance statistics for scored model candidates. */

import {
  asFiniteNumber,
  asRecord,
  fetchRemoteText,
  firstString,
  type JsonObject,
  mapWithConcurrency,
  parseJsonObject,
} from "../utils.ts";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/frontend/v1/catalog/models";
const OPENROUTER_STATS_BASE_URL = "https://openrouter.ai/api/frontend/v1/stats";
const OPENROUTER_TIMEOUT_MS = 10_000;
const OPENROUTER_CONCURRENCY = 8;

export type OpenRouterMetrics = {
  inputPrice: number | null;
  outputPrice: number | null;
  throughput: number | null;
  latency: number | null;
  e2eLatency: number | null;
};

/** Read one directory plus five provider-weighted statistics endpoints for each matched model. */
export async function fetchOpenRouterMetrics(
  catalogIds: readonly string[],
): Promise<Map<string, OpenRouterMetrics>> {
  if (catalogIds.length === 0) return new Map();
  const directoryResponse = await fetchJsonObject(OPENROUTER_MODELS_URL);
  const directory = Array.isArray(directoryResponse?.data) ? directoryResponse.data : [];
  const permaslugBySlug = new Map<string, string>();
  for (const value of directory) {
    const model = asRecord(value);
    const slug = firstString(model, ["slug"]);
    const permaslug = firstString(model, ["permaslug"]);
    if (slug && permaslug) permaslugBySlug.set(normalizeOpenRouterModelId(slug), permaslug);
  }

  const matchedModels = catalogIds.flatMap((catalogId) => {
    const permaslug = permaslugBySlug.get(normalizeOpenRouterModelId(catalogId));
    return permaslug ? [{ catalogId, permaslug }] : [];
  });
  const metrics = await mapWithConcurrency(
    matchedModels,
    OPENROUTER_CONCURRENCY,
    async ({ catalogId, permaslug }) => {
      const historyQuery = new URLSearchParams({ permaslug });
      const standardQuery = new URLSearchParams({ permaslug, variant: "standard" });
      const [pricing, endpoints, throughput, latency, e2eLatency] = await Promise.all([
        fetchJsonObject(`${OPENROUTER_STATS_BASE_URL}/effective-pricing?${standardQuery}`),
        fetchJsonObject(`${OPENROUTER_STATS_BASE_URL}/endpoint?${standardQuery}`),
        fetchJsonObject(`${OPENROUTER_STATS_BASE_URL}/throughput-comparison?${historyQuery}`),
        fetchJsonObject(`${OPENROUTER_STATS_BASE_URL}/latency-comparison?${historyQuery}`),
        fetchJsonObject(`${OPENROUTER_STATS_BASE_URL}/latency-e2e-comparison?${historyQuery}`),
      ]);
      return [
        catalogId,
        buildOpenRouterMetrics(pricing, endpoints, throughput, latency, e2eLatency),
      ] as const;
    },
  );
  return new Map(metrics.filter((entry) => Object.values(entry[1]).some((value) => value != null)));
}

async function fetchJsonObject(url: string): Promise<JsonObject | null> {
  const body = await fetchRemoteText(url, OPENROUTER_TIMEOUT_MS);
  return body === null ? null : parseJsonObject(body);
}

function buildOpenRouterMetrics(
  pricing: JsonObject | null,
  endpoints: JsonObject | null,
  throughputHistory: JsonObject | null,
  latencyHistory: JsonObject | null,
  e2eLatencyHistory: JsonObject | null,
): OpenRouterMetrics {
  const providerSummariesValue = asRecord(pricing?.data).providerSummaries;
  const providerSummaries = Array.isArray(providerSummariesValue) ? providerSummariesValue : [];
  let highestThroughput: number | null = null;
  let lowestLatencyMs: number | null = null;
  const endpointRows = Array.isArray(endpoints?.data) ? endpoints.data : [];
  for (const value of endpointRows) {
    const stats = asRecord(asRecord(value).stats);
    const throughput = asFiniteNumber(stats.p50_throughput);
    const latencyMs = asFiniteNumber(stats.p50_latency);
    if (throughput != null && (highestThroughput == null || throughput > highestThroughput)) {
      highestThroughput = throughput;
    }
    if (latencyMs != null && (lowestLatencyMs == null || latencyMs < lowestLatencyMs)) {
      lowestLatencyMs = latencyMs;
    }
  }
  const seriesTokenWeights = openRouterSeriesTokenWeights(providerSummaries, endpointRows);
  return {
    inputPrice: providerWeightedPrice(providerSummaries, "effectiveInputPrice"),
    outputPrice: providerWeightedPrice(providerSummaries, "effectiveOutputPrice"),
    throughput:
      tokenWeightedSeriesMean(throughputHistory, seriesTokenWeights, 1) ?? highestThroughput,
    latency:
      tokenWeightedSeriesMean(latencyHistory, seriesTokenWeights, 0.001) ??
      (lowestLatencyMs == null ? null : lowestLatencyMs / 1000),
    e2eLatency: tokenWeightedSeriesMean(e2eLatencyHistory, seriesTokenWeights, 0.001),
  };
}

function tokenWeightedSeriesMean(
  response: JsonObject | null,
  seriesTokenWeights: Record<string, number>,
  valueScale: number,
): number | null {
  const rows = Array.isArray(response?.data) ? response.data : [];
  const valuesBySeries = new Map<string, number[]>();
  for (const row of rows) {
    for (const [series, value] of Object.entries(asRecord(asRecord(row).y))) {
      const numericValue = asFiniteNumber(value);
      if (numericValue == null) continue;
      valuesBySeries.set(series, [
        ...(valuesBySeries.get(series) ?? []),
        numericValue * valueScale,
      ]);
    }
  }
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [series, weight] of Object.entries(seriesTokenWeights)) {
    if (!(weight > 0)) continue;
    const seriesMean = meanFinite(valuesBySeries.get(series) ?? []);
    if (seriesMean == null) continue;
    weightedSum += seriesMean * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function openRouterSeriesTokenWeights(
  providerSummaries: unknown[],
  endpointRows: unknown[],
): Record<string, number> {
  const totalTokensByProvider = new Map<string, number>();
  for (const value of providerSummaries) {
    const provider = asRecord(value);
    const providerName = firstString(provider, ["providerName"]);
    const totalTokens = asFiniteNumber(provider.totalTokens);
    if (providerName && totalTokens != null && totalTokens > 0) {
      totalTokensByProvider.set(providerName, totalTokens);
    }
  }
  const endpointsByProvider = new Map<string, Array<{ id: string; requestCount: number | null }>>();
  for (const value of endpointRows) {
    const endpoint = asRecord(value);
    const id = firstString(endpoint, ["id"]);
    const providerName =
      firstString(endpoint, ["provider_display_name", "provider_name"]) ??
      firstString(asRecord(endpoint.provider_info), ["displayName"]);
    if (!id || !providerName) continue;
    const providerEndpoints = endpointsByProvider.get(providerName) ?? [];
    providerEndpoints.push({
      id,
      requestCount: asFiniteNumber(asRecord(endpoint.stats).request_count),
    });
    endpointsByProvider.set(providerName, providerEndpoints);
  }

  const weights: Record<string, number> = {};
  for (const [providerName, providerEndpoints] of endpointsByProvider) {
    const totalTokens = totalTokensByProvider.get(providerName);
    if (totalTokens == null) continue;
    if (providerEndpoints.length === 1) {
      const endpoint = providerEndpoints[0];
      if (endpoint) weights[`${endpoint.id}::default`] = totalTokens;
      continue;
    }
    if (providerEndpoints.some((endpoint) => endpoint.requestCount == null)) continue;
    const totalRequests = providerEndpoints.reduce(
      (total, endpoint) => total + (endpoint.requestCount ?? 0),
      0,
    );
    if (totalRequests <= 0) continue;
    for (const endpoint of providerEndpoints) {
      if (endpoint.requestCount != null && endpoint.requestCount > 0) {
        weights[`${endpoint.id}::default`] = (totalTokens * endpoint.requestCount) / totalRequests;
      }
    }
  }
  return weights;
}

function providerWeightedPrice(
  providerSummaries: unknown[],
  field: "effectiveInputPrice" | "effectiveOutputPrice",
): number | null {
  let weightedSum = 0;
  let totalTokens = 0;
  for (const value of providerSummaries) {
    const provider = asRecord(value);
    const price = asFiniteNumber(provider[field]);
    const tokens = asFiniteNumber(provider.totalTokens);
    if (tokens == null || tokens < 0 || (tokens > 0 && (price == null || price < 0))) return null;
    if (tokens > 0 && price != null) {
      weightedSum += price * tokens;
      totalTokens += tokens;
    }
  }
  return totalTokens > 0 ? weightedSum / totalTokens : null;
}

function meanFinite(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value));
  return finiteValues.length > 0
    ? finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length
    : null;
}

export function normalizeOpenRouterModelId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/:[a-z0-9._-]+$/i, "");
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) return normalized;
  const provider = normalized.slice(0, slashIndex);
  return `${provider === "xai" ? "x-ai" : provider}${normalized.slice(slashIndex)}`;
}
