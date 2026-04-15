/**
 * Small orchestrator around the copied browser-safe harness stats modules.
 */

import type { AvailableModel } from "./config";
import { buildMatchedRows } from "./stats/llm-stats/match-stage";
import { enrichRows } from "./stats/llm-stats/openrouter-stage";
import {
	attachRelativeScores,
	blendedPriceValue,
	buildScores,
} from "./stats/llm-stats/scoring";
import { fetchSourceData } from "./stats/llm-stats/source-stage";
import type {
	LlmStatsStageConfig,
	ModelStatsSelectedModel,
} from "./stats/llm-stats/types";
import { asFiniteNumber, asRecord, type JsonObject } from "./stats/shared";

export type HarnessModelMetadata = Pick<
	AvailableModel,
	"intelligenceScore" | "speedMetric" | "logo" | "fallbackLogo"
>;

export type HarnessModelMetadataIndex = {
	modelsById: Record<string, HarnessModelMetadata>;
	providerLogosByProvider: Record<string, string>;
};

const LLM_STATS_STAGE_CONFIG = {
	matcher: {
		variantTokens: [
			"flash-lite",
			"flash",
			"pro",
			"nano",
			"mini",
			"lite",
			"max",
		],
	},
	openrouter: {
		speedConcurrency: 8,
	},
	final: {
		nullFieldPruneThreshold: 0.5,
		nullFieldPruneRecentLookbackDays: 90,
	},
	scoring: {
		intelligenceBenchmarkKeys: [
			"omniscience_accuracy",
			"hle",
			"lcr",
			"scicode",
		],
		agenticBenchmarkKeys: [
			"omniscience_nonhallucination_rate",
			"gdpval_normalized",
			"ifbench",
			"terminalbench_hard",
		],
		defaultSpeedOutputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
		speedOutputTokenRangeMin: 200,
		speedOutputTokenRangeMax: 8_000,
		speedAnchorQuantiles: [0.25, 0.5, 0.75],
		weightedPriceInputRatio: 0.75,
		weightedPriceOutputRatio: 0.25,
	},
} satisfies LlmStatsStageConfig;

const MIN_REQUIRED_RELATIVE_SCORE = 10;

let harnessModelMetadataPromise: Promise<HarnessModelMetadataIndex> | null =
	null;

export function normalizeOpenRouterModelId(modelId: string): string {
	return modelId
		.trim()
		.toLowerCase()
		.replace(/:[a-z0-9._-]+$/i, "");
}

function providerFromId(modelId: string | null | undefined): string | null {
	if (typeof modelId !== "string") {
		return null;
	}
	const separatorIndex = modelId.indexOf("/");
	if (separatorIndex <= 0) {
		return null;
	}
	return modelId.slice(0, separatorIndex).trim().toLowerCase();
}

function buildSpeed(
	model: JsonObject,
	modelId: string | null,
	openRouterSpeedById: Map<string, JsonObject>,
): JsonObject {
	const openRouterSpeed = modelId ? openRouterSpeedById.get(modelId) : null;
	return {
		throughput_tokens_per_second_median:
			asFiniteNumber(openRouterSpeed?.throughput_tokens_per_second_median) ??
			asFiniteNumber(model.median_speed) ??
			asFiniteNumber(model.median_output_tokens_per_second),
		latency_seconds_median:
			asFiniteNumber(openRouterSpeed?.latency_seconds_median) ??
			asFiniteNumber(model.median_time) ??
			asFiniteNumber(model.median_time_to_first_token_seconds),
		e2e_latency_seconds_median:
			asFiniteNumber(openRouterSpeed?.e2e_latency_seconds_median) ??
			asFiniteNumber(model.median_time) ??
			asFiniteNumber(model.median_time_to_first_answer_token) ??
			asFiniteNumber(openRouterSpeed?.latency_seconds_median) ??
			asFiniteNumber(model.median_time) ??
			asFiniteNumber(model.median_time_to_first_token_seconds),
	};
}

function buildCost(
	model: JsonObject,
	openRouterPricing: JsonObject,
): JsonObject | null {
	const baseCost = asRecord(model.cost);
	const cleanedCost: JsonObject = Object.fromEntries(
		Object.entries(baseCost).filter(([, value]) => value != null),
	);
	const weightedInput = asFiniteNumber(openRouterPricing.weighted_input);
	const weightedOutput = asFiniteNumber(openRouterPricing.weighted_output);

	if (weightedInput != null) {
		cleanedCost.weighted_input = weightedInput;
	}
	if (weightedOutput != null) {
		cleanedCost.weighted_output = weightedOutput;
	}

	const blendedPrice = blendedPriceValue(
		cleanedCost,
		LLM_STATS_STAGE_CONFIG.scoring,
	);
	if (blendedPrice != null) {
		cleanedCost.blended_price = blendedPrice;
	}

	return Object.keys(cleanedCost).length > 0 ? cleanedCost : null;
}

function hasMinimumScoreSignal(model: ModelStatsSelectedModel): boolean {
	const relativeScores = asRecord(model.relative_scores);
	return [
		"overall_score",
		"intelligence_score",
		"agentic_score",
		"speed_score",
	].some((key) => {
		const value = asFiniteNumber(relativeScores[key]);
		return value != null && value >= MIN_REQUIRED_RELATIVE_SCORE;
	});
}

function toProviderLogosByProvider(
	rows: Record<string, unknown>[],
): Record<string, string> {
	const providerLogosByProvider: Record<string, string> = {};

	for (const row of rows) {
		const rowRecord = asRecord(row);
		const modelId = typeof rowRecord.id === "string" ? rowRecord.id : null;
		const provider = providerFromId(modelId);
		const logo = typeof rowRecord.logo === "string" ? rowRecord.logo : null;
		if (!provider || !logo || providerLogosByProvider[provider]) {
			continue;
		}
		providerLogosByProvider[provider] = logo;
	}

	return providerLogosByProvider;
}

async function buildHarnessModelMetadataIndex(): Promise<HarnessModelMetadataIndex> {
	const sourceData = await fetchSourceData();
	const matchedRows = await buildMatchedRows(
		sourceData,
		LLM_STATS_STAGE_CONFIG.matcher,
	);
	const enrichedRows = await enrichRows(
		matchedRows,
		LLM_STATS_STAGE_CONFIG.openrouter,
		LLM_STATS_STAGE_CONFIG.scoring,
	);

	const scoredModels = attachRelativeScores(
		enrichedRows.rows.map((row) => {
			const rowRecord = asRecord(row);
			const modelId = typeof rowRecord.id === "string" ? rowRecord.id : null;
			const provider =
				providerFromId(modelId) ??
				(typeof rowRecord.provider_id === "string"
					? rowRecord.provider_id
					: null);
			const speed = buildSpeed(
				rowRecord,
				modelId,
				enrichedRows.openRouterSpeedById,
			);
			const cost = buildCost(
				rowRecord,
				modelId ? (enrichedRows.openRouterPricingById.get(modelId) ?? {}) : {},
			);

			return {
				id: modelId,
				name:
					typeof rowRecord.name === "string"
						? rowRecord.name
						: (modelId ?? null),
				provider,
				logo: typeof rowRecord.logo === "string" ? rowRecord.logo : "",
				attachment: null,
				reasoning: null,
				release_date:
					typeof rowRecord.release_date === "string"
						? rowRecord.release_date
						: null,
				modalities: null,
				open_weights: null,
				cost,
				context_window: null,
				speed,
				intelligence: rowRecord.intelligence ?? null,
				intelligence_index_cost: rowRecord.intelligence_index_cost ?? null,
				evaluations: rowRecord.evaluations ?? null,
				scores: buildScores(
					rowRecord,
					cost,
					speed,
					enrichedRows.speedOutputTokenAnchors,
					LLM_STATS_STAGE_CONFIG.scoring,
				),
				relative_scores: null,
			} satisfies ModelStatsSelectedModel;
		}),
	).filter((model) => model.id && hasMinimumScoreSignal(model));

	return {
		modelsById: Object.fromEntries(
			scoredModels.map((model) => {
				const normalizedModelId = normalizeOpenRouterModelId(model.id ?? "");
				const logo =
					typeof model.logo === "string" && model.logo.length > 0
						? model.logo
						: undefined;

				return [
					normalizedModelId,
					{
						intelligenceScore:
							asFiniteNumber(
								asRecord(model.relative_scores).intelligence_score,
							) ?? null,
						speedMetric:
							asFiniteNumber(asRecord(model.relative_scores).speed_score) ??
							null,
						logo,
						fallbackLogo: logo,
					},
				];
			}),
		),
		providerLogosByProvider: toProviderLogosByProvider(enrichedRows.rows),
	};
}

export async function fetchHarnessModelMetadataMap(): Promise<HarnessModelMetadataIndex> {
	try {
		if (!harnessModelMetadataPromise) {
			harnessModelMetadataPromise = buildHarnessModelMetadataIndex().catch(
				(error) => {
					harnessModelMetadataPromise = null;
					throw error;
				},
			);
		}

		return await harnessModelMetadataPromise;
	} catch (error) {
		console.error("Failed to build harness model metadata", error);
		return {
			modelsById: {},
			providerLogosByProvider: {},
		};
	}
}
