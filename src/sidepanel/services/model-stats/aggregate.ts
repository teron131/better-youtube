/** Build source-neutral model scores from public aggregate leaderboards and OpenRouter performance evidence. */

import { asRecord, firstNumber, firstString, isFiniteNumber, type JsonObject } from "../utils.ts";
import { fetchAggregateSources, type ValsIndexRow } from "./leaderboards.ts";
import { fetchOpenRouterMetrics, type OpenRouterMetrics } from "./openrouter.ts";

const BLENDED_PRICE_INPUT_SHARE = 0.5;
const BLENDED_PRICE_OUTPUT_SHARE = 0.5;
const INDEX_BENCHMARK_COUNTS_WITHOUT_EPOCH = {
  artificialAnalysis: 9,
  vals: 7,
  surge: 8,
};
// Epoch publishes one aggregate ECI value, so derive its representative count from the median of the other indexes rather than its 57 underlying benchmarks.
const INDEX_BENCHMARK_COUNTS = {
  artificialAnalysis: INDEX_BENCHMARK_COUNTS_WITHOUT_EPOCH.artificialAnalysis,
  vals: INDEX_BENCHMARK_COUNTS_WITHOUT_EPOCH.vals,
  epoch: median(Object.values(INDEX_BENCHMARK_COUNTS_WITHOUT_EPOCH)),
  surge: INDEX_BENCHMARK_COUNTS_WITHOUT_EPOCH.surge,
};
const INDEX_RELEVANCE_WEIGHTS = {
  artificialAnalysis: { intelligence: 0.6, agentic: 0.4 },
  vals: { intelligence: 0.35, agentic: 0.65 },
  epoch: { intelligence: 0.8, agentic: 0.2 },
  surge: { intelligence: 0.75, agentic: 0.25 },
} satisfies Record<QualityIndex, Record<QualityDimension, number>>;
const REASONING_EFFORT_SUFFIX_PATTERN =
  /-(?:non-reasoning|minimal|low|medium|high|xhigh|extra-high|max)$/i;
const QUALITY_SIGMA = 0.5;
const MIN_QUALITY_DEVIATION = 0.35;
const FAVORABLE_TAIL_SHARE = 0.025;
const FULL_PEER_SUPPORT = 3;
const COVERAGE_CONFIDENCE_FLOOR = 0.1;
const COVERAGE_CONFIDENCE_FULL = 0.6;

type QualityDimension = "intelligence" | "agentic";
type QualityIndex = keyof typeof INDEX_BENCHMARK_COUNTS;
type QualityIndexScores = Record<QualityIndex, Record<QualityDimension, number | null>>;

export type ModelStats = {
  id: string;
  name: string;
  provider: string;
  releaseDate?: string | null;
  inputModalities?: string[];
  intelligenceScore?: number | null;
  agenticScore?: number | null;
  blendedPrice?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
  valueScore?: number | null;
  valueConfidence?: number | null;
  contextWindow?: number | null;
  speedScore?: number | null;
  throughput?: number | null;
  latency?: number | null;
};

type ArtificialAnalysisStats = {
  row: JsonObject;
  intelligence: number | null;
  agentic: number | null;
  speed: number | null;
  logTaskCost: number | null;
};

type ValsIndexStats = {
  intelligence: number | null;
  speed: number | null;
  logTaskCost: number | null;
};

/** Combine independently normalized source cohorts and shrink thin-evidence results toward neutral. */
export async function fetchAggregateStats(catalogIds: readonly string[]): Promise<ModelStats[]> {
  const uniqueCatalogIds = [...new Set(catalogIds)].sort();
  if (uniqueCatalogIds.length === 0) return [];

  const sources = await fetchAggregateSources();
  const candidateIds = buildCandidateIdIndex(uniqueCatalogIds);
  const artificialAnalysis = buildArtificialAnalysisStats(sources.artificialAnalysis, candidateIds);
  const valsIndex = buildValsIndexStats(sources.valsIndex, candidateIds);
  const epochCapabilitiesIndex = buildNormalizedIndexScores(
    sources.epochCapabilitiesIndex,
    candidateIds,
    (row) => [row.modelId, row.model],
  );
  const surgeIntelligenceIndex = buildNormalizedIndexScores(
    sources.surgeIntelligenceIndex,
    candidateIds,
    (row) => [row.model],
  );
  const scoredCatalogIds = uniqueCatalogIds.filter((catalogId) =>
    [
      artificialAnalysis.get(catalogId)?.intelligence ?? null,
      valsIndex.get(catalogId)?.intelligence ?? null,
      epochCapabilitiesIndex.get(catalogId) ?? null,
      surgeIntelligenceIndex.get(catalogId) ?? null,
    ].some(isFiniteNumber),
  );
  const openRouterMetrics = await fetchOpenRouterMetrics(scoredCatalogIds);
  const qualityIndexScores = scoredCatalogIds.map((catalogId): QualityIndexScores => {
    const artificialAnalysisStats = artificialAnalysis.get(catalogId);
    const valsScore = valsIndex.get(catalogId)?.intelligence ?? null;
    const epochScore = epochCapabilitiesIndex.get(catalogId) ?? null;
    const surgeScore = surgeIntelligenceIndex.get(catalogId) ?? null;
    return {
      artificialAnalysis: {
        intelligence: artificialAnalysisStats?.intelligence ?? null,
        agentic: artificialAnalysisStats?.agentic ?? null,
      },
      vals: { intelligence: valsScore, agentic: valsScore },
      epoch: { intelligence: epochScore, agentic: epochScore },
      surge: { intelligence: surgeScore, agentic: surgeScore },
    };
  });
  const intelligenceScores = qualityIndexScores.map((scores) =>
    indexWeightedMean(scores, "intelligence"),
  );
  const agenticScores = qualityIndexScores.map((scores) => indexWeightedMean(scores, "agentic"));
  const blendedPrices = scoredCatalogIds.map((catalogId) =>
    effectiveBlendedPrice(openRouterMetrics.get(catalogId)),
  );
  const blendedPriceScores = qualityLocalCostScores(
    scoredCatalogIds.map((_, index) =>
      meanFinite([intelligenceScores[index] ?? null, agenticScores[index] ?? null]),
    ),
    blendedPrices.map(logOnePlus),
  );
  const artificialAnalysisTaskCostScores = qualityLocalCostScores(
    scoredCatalogIds.map((catalogId) => artificialAnalysis.get(catalogId)?.intelligence ?? null),
    scoredCatalogIds.map((catalogId) => artificialAnalysis.get(catalogId)?.logTaskCost ?? null),
  );
  const valsTaskCostScores = qualityLocalCostScores(
    scoredCatalogIds.map((catalogId) => valsIndex.get(catalogId)?.intelligence ?? null),
    scoredCatalogIds.map((catalogId) => valsIndex.get(catalogId)?.logTaskCost ?? null),
  );
  const valueComponents = scoredCatalogIds.map((_, index) => [
    blendedPriceScores[index] ?? null,
    artificialAnalysisTaskCostScores[index] ?? null,
    valsTaskCostScores[index] ?? null,
  ]);
  const valueScores = valueComponents.map(coverageAdjustedMean);
  const valueConfidences = valueComponents.map(
    (components) => components.filter(isFiniteNumber).length / components.length,
  );
  const throughputSignals = scoredCatalogIds.map(
    (catalogId) => openRouterMetrics.get(catalogId)?.throughput ?? null,
  );
  const latencySignals = scoredCatalogIds.map(
    (catalogId) => openRouterMetrics.get(catalogId)?.latency ?? null,
  );
  const e2eLatencySignals = scoredCatalogIds.map(
    (catalogId) => openRouterMetrics.get(catalogId)?.e2eLatency ?? null,
  );
  const throughputScale = minMaxScale(throughputSignals.map(naturalLog));
  const latencyScale = minMaxScale(latencySignals.map(naturalLog), "lower");
  const e2eLatencyScale = minMaxScale(e2eLatencySignals.map(naturalLog), "lower");
  const speedComponents = scoredCatalogIds.map((catalogId, index) => [
    throughputScale(naturalLog(throughputSignals[index] ?? null)),
    latencyScale(naturalLog(latencySignals[index] ?? null)),
    e2eLatencyScale(naturalLog(e2eLatencySignals[index] ?? null)),
    artificialAnalysis.get(catalogId)?.speed ?? null,
    valsIndex.get(catalogId)?.speed ?? null,
  ]);
  const speedScores = speedComponents.map(coverageAdjustedMean);

  return scoredCatalogIds.map((catalogId, index) => {
    const artificialAnalysisStats = artificialAnalysis.get(catalogId);
    const metrics = openRouterMetrics.get(catalogId);
    const provider = catalogId.slice(0, catalogId.indexOf("/"));
    const idName = catalogId.slice(catalogId.indexOf("/") + 1);
    return {
      id: catalogId,
      name: artificialAnalysisDisplayName(artificialAnalysisStats?.row) ?? idName,
      provider,
      releaseDate: firstString(artificialAnalysisStats?.row, ["releaseDate"]),
      inputModalities: artificialAnalysisInputModalities(artificialAnalysisStats?.row),
      intelligenceScore: roundToHundredths(intelligenceScores[index] ?? null),
      agenticScore: roundToHundredths(agenticScores[index] ?? null),
      blendedPrice: blendedPrices[index] ?? null,
      inputPrice: metrics?.inputPrice ?? null,
      outputPrice: metrics?.outputPrice ?? null,
      valueScore: roundToHundredths(valueScores[index] ?? null),
      valueConfidence: valueScores[index] == null ? null : valueConfidences[index],
      contextWindow: firstNumber(artificialAnalysisStats?.row, ["contextWindowTokens"]),
      speedScore: roundToHundredths(speedScores[index] ?? null),
      throughput: metrics?.throughput ?? null,
      latency: metrics?.latency ?? null,
    };
  });
}

function buildArtificialAnalysisStats(
  rows: JsonObject[],
  candidateIds: Map<string, string | null>,
): Map<string, ArtificialAnalysisStats> {
  const matchedRows = new Map<string, JsonObject>();
  for (const row of rows) {
    const catalogId = findCandidateId(candidateIds, artificialAnalysisCandidateKeys(row));
    if (!catalogId) continue;
    const current = matchedRows.get(catalogId);
    if (
      (firstNumber(row, ["intelligenceIndex"]) ?? Number.NEGATIVE_INFINITY) >
      (firstNumber(current, ["intelligenceIndex"]) ?? Number.NEGATIVE_INFINITY)
    ) {
      matchedRows.set(catalogId, row);
    }
  }
  const intelligenceScale = minMaxScale(rows.map((row) => firstNumber(row, ["intelligenceIndex"])));
  const codingScale = minMaxScale(rows.map((row) => firstNumber(row, ["codingIndex"])));
  const omniscienceScale = minMaxScale(
    rows.map((row) => firstNumber(row, ["omniscience", "omniscienceIndex"])),
  );
  const agenticScale = minMaxScale(rows.map((row) => firstNumber(row, ["agenticIndex"])));
  const throughputScale = minMaxScale(
    rows.map((row) => naturalLog(firstNumber(row, ["medianOutputTokensPerSecond"]))),
  );
  const latencyScale = minMaxScale(
    rows.map((row) => naturalLog(firstNumber(row, ["medianTimeToFirstTokenSeconds"]))),
    "lower",
  );
  const statsByModel = new Map<string, ArtificialAnalysisStats>();
  for (const [catalogId, row] of matchedRows) {
    const intelligence = meanFinite([
      intelligenceScale(firstNumber(row, ["intelligenceIndex"])),
      codingScale(firstNumber(row, ["codingIndex"])),
      omniscienceScale(firstNumber(row, ["omniscience", "omniscienceIndex"])),
    ]);
    const throughput = naturalLog(firstNumber(row, ["medianOutputTokensPerSecond"]));
    const latency = naturalLog(firstNumber(row, ["medianTimeToFirstTokenSeconds"]));
    statsByModel.set(catalogId, {
      row,
      intelligence,
      agentic: agenticScale(firstNumber(row, ["agenticIndex"])),
      speed: meanFinite([throughputScale(throughput), latencyScale(latency)]),
      logTaskCost: naturalLog(artificialAnalysisCostPerTask(row)),
    });
  }
  return statsByModel;
}

function buildValsIndexStats(
  rows: ValsIndexRow[],
  candidateIds: Map<string, string | null>,
): Map<string, ValsIndexStats> {
  const matchedRows = new Map<string, ValsIndexRow>();
  for (const row of rows) {
    const catalogId = findCandidateId(candidateIds, [row.modelId, row.model]);
    const current = catalogId ? matchedRows.get(catalogId) : null;
    if (catalogId && row.score > (current?.score ?? Number.NEGATIVE_INFINITY)) {
      matchedRows.set(catalogId, row);
    }
  }
  const intelligenceScale = minMaxScale(rows.map((row) => row.score));
  const speedScale = minMaxScale(
    rows.map((row) => naturalLog(row.latency)),
    "lower",
  );
  const statsByModel = new Map<string, ValsIndexStats>();
  for (const [catalogId, row] of matchedRows) {
    statsByModel.set(catalogId, {
      intelligence: intelligenceScale(row.score),
      speed: speedScale(naturalLog(row.latency)),
      logTaskCost: naturalLog(row.costPerTest),
    });
  }
  return statsByModel;
}

function buildNormalizedIndexScores<Row extends { score: number }>(
  rows: Row[],
  candidateIds: Map<string, string | null>,
  candidateKeys: (row: Row) => string[],
): Map<string, number> {
  const scale = minMaxScale(rows.map((row) => row.score));
  const scoresByModel = new Map<string, number>();
  for (const row of rows) {
    const catalogId = findCandidateId(candidateIds, candidateKeys(row));
    const score = scale(row.score);
    if (!catalogId || score == null) continue;
    scoresByModel.set(catalogId, Math.max(score, scoresByModel.get(catalogId) ?? -1));
  }
  return scoresByModel;
}

function buildCandidateIdIndex(catalogIds: readonly string[]): Map<string, string | null> {
  const candidateIds = new Map<string, string | null>();
  for (const catalogId of catalogIds) {
    const modelId = catalogId.slice(catalogId.indexOf("/") + 1);
    addCandidateId(candidateIds, catalogId, catalogId);
    addCandidateId(candidateIds, modelId, catalogId);
    const undatedModelId = modelId.replace(/-\d{4}$/, "");
    if (undatedModelId !== modelId) addCandidateId(candidateIds, undatedModelId, catalogId);
  }
  return candidateIds;
}

function addCandidateId(
  candidateIds: Map<string, string | null>,
  candidate: string,
  catalogId: string,
) {
  const key = normalizeModelKey(candidate);
  if (!key) return;
  const current = candidateIds.get(key);
  candidateIds.set(key, current === undefined || current === catalogId ? catalogId : null);
}

function findCandidateId(
  candidateIds: Map<string, string | null>,
  candidates: Array<string | null>,
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const catalogId = candidateIds.get(normalizeModelKey(candidate));
    if (catalogId) return catalogId;
  }
  return null;
}

function artificialAnalysisCandidateKeys(row: JsonObject): string[] {
  const provider = firstString(row, ["modelCreatorSlug", "modelCreatorName"]);
  const slug = firstString(row, ["slug"]);
  const baseSlug = slug?.replace(REASONING_EFFORT_SUFFIX_PATTERN, "") ?? null;
  const names = [baseSlug, slug, artificialAnalysisDisplayName(row)].filter(
    (value): value is string => Boolean(value),
  );
  return [...(provider ? names.map((name) => `${provider}/${name}`) : []), ...names];
}

function artificialAnalysisDisplayName(row: JsonObject | undefined): string | null {
  const name = firstString(row, ["shortName", "name", "slug"]);
  return (
    name
      ?.replace(
        /\s+\([^()]*(?:effort|reasoning|non-reasoning|minimal|low|medium|high|xhigh|max)[^()]*\)\s*$/i,
        "",
      )
      .trim() || null
  );
}

function artificialAnalysisInputModalities(row: JsonObject | undefined): string[] {
  if (!row) return ["text"];
  return [
    row.inputModalityText ? "text" : null,
    row.inputModalityImage ? "image" : null,
    row.inputModalitySpeech ? "audio" : null,
    row.inputModalityVideo ? "video" : null,
  ].filter((value): value is string => value != null);
}

function artificialAnalysisCostPerTask(row: JsonObject): number | null {
  const costPerTask = asRecord(row.intelligenceIndexCostPerTask);
  return firstNumber(asRecord(costPerTask.cost), ["total"]) ?? firstNumber(row, ["cost_per_task"]);
}

function effectiveBlendedPrice(metrics: OpenRouterMetrics | undefined): number | null {
  return metrics?.inputPrice != null && metrics.outputPrice != null
    ? BLENDED_PRICE_INPUT_SHARE * metrics.inputPrice +
        BLENDED_PRICE_OUTPUT_SHARE * metrics.outputPrice
    : null;
}

function coverageAdjustedMean(components: Array<number | null>): number | null {
  const estimate = meanFinite(components);
  if (estimate == null) return null;
  const availableCount = components.filter(isFiniteNumber).length;
  const confidence = coverageConfidence(availableCount, components.length);
  return 50 + confidence * (estimate - 50);
}

function indexWeightedMean(scores: QualityIndexScores, dimension: QualityDimension): number | null {
  let availableWeight = 0;
  let weightedTotal = 0;
  for (const index of Object.keys(INDEX_BENCHMARK_COUNTS) as QualityIndex[]) {
    const score = scores[index][dimension];
    if (isFiniteNumber(score)) {
      const weight = INDEX_BENCHMARK_COUNTS[index] * INDEX_RELEVANCE_WEIGHTS[index][dimension];
      availableWeight += weight;
      weightedTotal += score * weight;
    }
  }
  return availableWeight === 0 ? null : weightedTotal / availableWeight;
}

function normalizeModelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[._:\s]+/g, "-")
    .replace(/[^a-z0-9/-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function minMaxScale(
  values: Array<number | null>,
  direction: "higher" | "lower" = "higher",
): (value: number | null) => number | null {
  const finiteValues = values.filter(isFiniteNumber);
  const minimum = finiteValues.length > 0 ? Math.min(...finiteValues) : null;
  const maximum = finiteValues.length > 0 ? Math.max(...finiteValues) : null;
  return (value) => {
    if (value == null || minimum == null || maximum == null) return null;
    if (maximum === minimum) return 50;
    const score = (100 * (value - minimum)) / (maximum - minimum);
    return direction === "higher" ? score : 100 - score;
  };
}

/** Score cost against model-excluded peers at nearby quality and shrink weak support to neutral. */
function qualityLocalCostScores(
  qualities: Array<number | null>,
  costs: Array<number | null>,
): Array<number | null> {
  const pairedQualities = qualities.filter(
    (quality, index): quality is number => isFiniteNumber(quality) && costs[index] != null,
  );
  if (pairedQualities.length < 2) return qualities.map(() => null);
  const sortedQualities = [...pairedQualities].sort((left, right) => left - right);
  const qualityDeviation = Math.max(
    ((quantile(sortedQualities, 0.75) as number) - (quantile(sortedQualities, 0.25) as number)) /
      1.349,
    MIN_QUALITY_DEVIATION,
  );
  const residuals = qualities.map(() => null as number | null);
  const supportConfidences = qualities.map(() => 0);

  for (let index = 0; index < qualities.length; index += 1) {
    const quality = qualities[index];
    const cost = costs[index];
    if (quality == null || cost == null) continue;
    let weightedCost = 0;
    let totalWeight = 0;
    let squaredWeight = 0;
    for (let peerIndex = 0; peerIndex < qualities.length; peerIndex += 1) {
      const peerQuality = qualities[peerIndex];
      const peerCost = costs[peerIndex];
      if (peerIndex === index || peerQuality == null || peerCost == null) continue;
      const qualityDistance = (quality - peerQuality) / qualityDeviation / QUALITY_SIGMA;
      const weight = Math.exp(-0.5 * qualityDistance ** 2);
      weightedCost += peerCost * weight;
      totalWeight += weight;
      squaredWeight += weight * weight;
    }
    if (totalWeight <= 0) continue;
    residuals[index] = cost - weightedCost / totalWeight;
    const effectivePeers = Math.min(
      totalWeight,
      squaredWeight > 0 ? (totalWeight * totalWeight) / squaredWeight : 0,
    );
    supportConfidences[index] = smoothstep((effectivePeers - 1) / (FULL_PEER_SUPPORT - 1));
  }

  const supportedResiduals = residuals.map((residual, index) =>
    supportConfidences[index] > 0 ? residual : null,
  );
  const finiteResiduals = supportedResiduals.filter(isFiniteNumber);
  const residualRange =
    finiteResiduals.length > 1 ? Math.max(...finiteResiduals) - Math.min(...finiteResiduals) : 0;
  const residualScale = Math.max(1, ...finiteResiduals.map(Math.abs));
  if (residualRange <= Number.EPSILON * residualScale * 32) {
    return residuals.map((residual) => (residual == null ? null : 50));
  }

  const minMaxScores = winsorizedMinMaxScores(supportedResiduals, "lower");
  const inverseResiduals = finiteResiduals.map((residual) => -residual);
  return residuals.map((residual, index) => {
    if (residual == null) return null;
    const percentileScore = percentileRank(inverseResiduals, -residual);
    const hybridScore = meanFinite([minMaxScores[index] ?? null, percentileScore]);
    return 50 + supportConfidences[index] * ((hybridScore ?? 50) - 50);
  });
}

function winsorizedMinMaxScores(
  values: Array<number | null>,
  direction: "higher" | "lower",
): Array<number | null> {
  const finiteValues = values.filter(isFiniteNumber).sort((left, right) => left - right);
  if (finiteValues.length === 0) return values.map(() => null);
  const lower = quantile(finiteValues, direction === "lower" ? FAVORABLE_TAIL_SHARE : 0) as number;
  const upper = quantile(
    finiteValues,
    direction === "higher" ? 1 - FAVORABLE_TAIL_SHARE : 1,
  ) as number;
  if (upper <= lower) return values.map((value) => (value == null ? null : 100));
  return values.map((value) => {
    if (!isFiniteNumber(value)) return null;
    const normalized = (Math.min(upper, Math.max(lower, value)) - lower) / (upper - lower);
    return 100 * (direction === "higher" ? normalized : 1 - normalized);
  });
}

function quantile(sortedValues: number[], probability: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * Math.min(1, Math.max(0, probability));
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex] as number;
  const upper = sortedValues[upperIndex] as number;
  return lower + (upper - lower) * (index - lowerIndex);
}

function median(values: readonly number[]): number {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[middleIndex] as number;
  return ((sortedValues[middleIndex - 1] as number) + (sortedValues[middleIndex] as number)) / 2;
}

function percentileRank(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  const lowerCount = values.filter((candidate) => candidate < value).length;
  const equalCount = values.filter((candidate) => candidate === value).length;
  return values.length === 1
    ? 50
    : (100 * (lowerCount + (equalCount - 1) / 2)) / (values.length - 1);
}

function smoothstep(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function coverageConfidence(availableCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  const coverage = availableCount / totalCount;
  if (coverage >= COVERAGE_CONFIDENCE_FULL) return 1;
  return smoothstep(
    (coverage - COVERAGE_CONFIDENCE_FLOOR) / (COVERAGE_CONFIDENCE_FULL - COVERAGE_CONFIDENCE_FLOOR),
  );
}

function meanFinite(values: Array<number | null>): number | null {
  const finiteValues = values.filter(isFiniteNumber);
  return finiteValues.length > 0
    ? finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length
    : null;
}

function logOnePlus(value: number | null): number | null {
  return value != null && value >= 0 ? Math.log1p(value) : null;
}

function naturalLog(value: number | null): number | null {
  return value != null && value > 0 ? Math.log(value) : null;
}

function roundToHundredths(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(2));
}
