/**
 * Optional sidepanel score metadata from the public Model Atlas deployment.
 *
 * Model scores guide sorting/labels only. The extension must keep working when
 * this endpoint, localStorage, or the payload shape is unavailable.
 */

import type { AvailableModel } from "./config.ts";
import { asFiniteNumber, asRecord } from "./utils.ts";

export type LlmStatsModelMetadata = Pick<
	AvailableModel,
	"intelligenceScore" | "speedMetric"
>;

export type LlmStatsModelMetadataIndex = {
	modelsById: Record<string, LlmStatsModelMetadata>;
};

const MIN_REQUIRED_RELATIVE_SCORE = 10;
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const MODEL_ATLAS_PAYLOAD_CACHE_KEY = "model-atlas:core-payload:v1";
const MODEL_ATLAS_STATS_URL =
	"https://llm-stats.vercel.app/api/llm-stats?view=core";

let llmStatsModelMetadataPromise: Promise<LlmStatsModelMetadataIndex> | null =
	null;

type LlmStatsCachedModel = {
	id: string | null;
	relative_scores?: unknown;
	overall_score?: unknown;
	intelligence_score?: unknown;
	agentic_score?: unknown;
	speed_score?: unknown;
	score?: unknown;
};

type LlmStatsCachedPayload = {
	fetched_at_epoch_seconds?: number | null;
	models?: unknown;
	scores?: unknown;
};

type LlmStatsModelScoreSignals = {
	overallScore: number | null;
	intelligenceScore: number | null;
	agenticScore: number | null;
	speedScore: number | null;
};

export function normalizeOpenRouterModelId(modelId: string): string {
	return modelId
		.trim()
		.toLowerCase()
		.replace(/:[a-z0-9._-]+$/i, "");
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
		if (payloadRows(payload).length === 0 || !isFreshPayload(payload)) {
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
	if (payloadRows(payload).length === 0) {
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

function payloadRows(payload: LlmStatsCachedPayload | null): unknown[] {
	if (Array.isArray(payload?.models)) {
		return payload.models;
	}
	if (Array.isArray(payload?.scores)) {
		return payload.scores;
	}
	return [];
}

function scoreSignals(model: LlmStatsCachedModel): LlmStatsModelScoreSignals {
	const relativeScores = asRecord(model.relative_scores);
	const compactScore = asRecord(model.score);

	return {
		overallScore:
			asFiniteNumber(relativeScores.overall_score) ??
			asFiniteNumber(model.overall_score) ??
			asFiniteNumber(compactScore.overall) ??
			null,
		intelligenceScore:
			asFiniteNumber(relativeScores.intelligence_score) ??
			asFiniteNumber(model.intelligence_score) ??
			asFiniteNumber(compactScore.intelligence) ??
			null,
		agenticScore:
			asFiniteNumber(relativeScores.agentic_score) ??
			asFiniteNumber(model.agentic_score) ??
			asFiniteNumber(compactScore.agentic) ??
			null,
		speedScore:
			asFiniteNumber(relativeScores.speed_score) ??
			asFiniteNumber(model.speed_score) ??
			asFiniteNumber(compactScore.speed) ??
			null,
	};
}

function hasMinimumScoreSignal(model: LlmStatsCachedModel): boolean {
	const signals = scoreSignals(model);
	return Object.values(signals).some(
		(value) => value != null && value >= MIN_REQUIRED_RELATIVE_SCORE,
	);
}

async function buildLlmStatsModelMetadataIndex(): Promise<LlmStatsModelMetadataIndex> {
	const payload = await loadModelAtlasPayload();
	const scoredModels = payloadRows(payload).filter(
		(model): model is LlmStatsCachedModel =>
			isCachedModel(model) && !!model.id && hasMinimumScoreSignal(model),
	);

	return {
		modelsById: Object.fromEntries(
			scoredModels.map((model) => {
				const normalizedModelId = normalizeOpenRouterModelId(model.id ?? "");
				const signals = scoreSignals(model);

				return [
					normalizedModelId,
					{
						intelligenceScore: signals.intelligenceScore,
						speedMetric: signals.speedScore,
					},
				];
			}),
		),
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
	} catch {
		return {
			modelsById: {},
		};
	}
}
