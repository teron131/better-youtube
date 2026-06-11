/**
 * Sidepanel metadata adapter for Model Atlas payloads.
 */

import type { AvailableModel } from "./config.ts";
import { asFiniteNumber, asRecord } from "./utils.ts";

export type LlmStatsModelMetadata = Pick<
	AvailableModel,
	"intelligenceScore" | "speedMetric" | "logo" | "fallbackLogo"
>;

export type LlmStatsModelMetadataIndex = {
	modelsById: Record<string, LlmStatsModelMetadata>;
	providerLogosByProvider: Record<string, string>;
};

const MIN_REQUIRED_RELATIVE_SCORE = 10;
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const MODEL_ATLAS_PAYLOAD_CACHE_KEY = "model-atlas:selected-payload:v1";
const MODEL_ATLAS_STATS_URL = "https://llm-stats.vercel.app/api/llm-stats";

let llmStatsModelMetadataPromise: Promise<LlmStatsModelMetadataIndex> | null =
	null;

type LlmStatsCachedModel = {
	id: string | null;
	provider?: string | null;
	logo?: string | null;
	relative_scores?: unknown;
};

type LlmStatsCachedPayload = {
	fetched_at_epoch_seconds?: number | null;
	models?: unknown;
};

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

function isFreshPayload(payload: LlmStatsCachedPayload): boolean {
	const fetchedAt = payload.fetched_at_epoch_seconds;
	if (typeof fetchedAt !== "number") {
		return false;
	}
	const ageSeconds = Math.floor(Date.now() / 1000) - fetchedAt;
	return ageSeconds >= 0 && ageSeconds <= CACHE_TTL_SECONDS;
}

function readCachedPayload(key: string): LlmStatsCachedPayload | null {
	try {
		const content = globalThis.localStorage?.getItem(key);
		if (!content) return null;
		const payload = JSON.parse(content) as LlmStatsCachedPayload;
		if (!Array.isArray(payload.models) || !isFreshPayload(payload)) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}

function writeCachedPayload(key: string, payload: LlmStatsCachedPayload): void {
	try {
		globalThis.localStorage?.setItem(key, JSON.stringify(payload));
	} catch {
		// Metadata improves ranking, but cache write failures should not block UI.
	}
}

function loadModelAtlasCachedPayload(): LlmStatsCachedPayload | null {
	if (typeof globalThis.localStorage === "undefined") {
		return null;
	}
	return readCachedPayload(MODEL_ATLAS_PAYLOAD_CACHE_KEY);
}

async function fetchModelAtlasPayload(): Promise<LlmStatsCachedPayload | null> {
	const response = await fetch(MODEL_ATLAS_STATS_URL);
	if (!response.ok) {
		return null;
	}
	const payload = (await response.json()) as LlmStatsCachedPayload;
	if (!Array.isArray(payload.models)) {
		return null;
	}
	writeCachedPayload(MODEL_ATLAS_PAYLOAD_CACHE_KEY, payload);
	return payload;
}

async function loadModelAtlasPayload(): Promise<LlmStatsCachedPayload | null> {
	const cachedPayload = loadModelAtlasCachedPayload();
	if (cachedPayload) {
		return cachedPayload;
	}
	return fetchModelAtlasPayload();
}

function isCachedModel(value: unknown): value is LlmStatsCachedModel {
	if (value == null || typeof value !== "object") {
		return false;
	}
	const model = value as Partial<LlmStatsCachedModel>;
	return typeof model.id === "string" || model.id === null;
}

function hasMinimumScoreSignal(model: LlmStatsCachedModel): boolean {
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

function toProviderLogosByProvider(rows: unknown[]): Record<string, string> {
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

async function buildLlmStatsModelMetadataIndex(): Promise<LlmStatsModelMetadataIndex> {
	const payload = await loadModelAtlasPayload();
	const scoredModels = (
		Array.isArray(payload?.models) ? payload.models : []
	).filter(
		(model): model is LlmStatsCachedModel =>
			isCachedModel(model) && !!model.id && hasMinimumScoreSignal(model),
	);

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
		providerLogosByProvider: toProviderLogosByProvider(scoredModels),
	};
}

export async function fetchLlmStatsModelMetadataIndex(): Promise<LlmStatsModelMetadataIndex> {
	try {
		if (!llmStatsModelMetadataPromise) {
			llmStatsModelMetadataPromise = buildLlmStatsModelMetadataIndex().catch(
				(error) => {
					llmStatsModelMetadataPromise = null;
					throw error;
				},
			);
		}

		return await llmStatsModelMetadataPromise;
	} catch (error) {
		console.error("Failed to build model-atlas metadata", error);
		return {
			modelsById: {},
			providerLogosByProvider: {},
		};
	}
}
