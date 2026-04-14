/**
 * Model Statistics and Logo Service
 * Fetches model metadata, leaderboard scores, and logos from remote sources.
 */

import type { AvailableModel } from "./config";

const MODELS_DEV_URL = "https://models.dev/api.json";
const LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const LEADERBOARD_ROW_TOKEN = '"openrouterApiId":"';
const ARTIFICIAL_ANALYSIS_LOGO_URL = "https://artificialanalysis.ai/img/logos";
const PRICE_PER_MILLION_TOKENS = 1_000_000;
const INPUT_PRICE_WEIGHT = 3;
const OUTPUT_PRICE_WEIGHT = 1;

export interface ModelStat {
	id: string;
	name: string;
	provider: string;
	logo: string;
	fallbackLogo: string;
	cost?: number | null;
}

export interface LeaderboardStat {
	intelligenceScore: number | null;
	speedScore: number | null;
}

export interface ProviderLogoStat {
	logo: string;
}

type LeaderboardRow = Record<string, unknown>;

type ModelsDevProvider = {
	models?: Record<string, any>;
};

type OpenRouterModel = {
	id: string;
	name: string;
	pricing?: {
		prompt?: string;
		completion?: string;
	};
};

function normalizeLogoProvider(
	provider: string | null | undefined,
): string | null {
	if (typeof provider !== "string") {
		return null;
	}
	const normalizedProvider = provider.trim().toLowerCase();
	return normalizedProvider.length > 0 ? normalizedProvider : null;
}

function providerFromModelId(modelId: string): string | null {
	const separatorIndex = modelId.indexOf("/");
	if (separatorIndex <= 0) {
		return null;
	}
	return normalizeLogoProvider(modelId.slice(0, separatorIndex));
}

function artificialAnalysisLogoUrl(slug: string): string {
	return `${ARTIFICIAL_ANALYSIS_LOGO_URL}/${slug}_small.svg`;
}

function toAbsoluteArtificialAnalysisLogoUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length === 0) {
		return null;
	}
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return value;
	}
	if (value.startsWith("/")) {
		return `https://artificialanalysis.ai${value}`;
	}
	if (value.includes("/")) {
		return `https://artificialanalysis.ai/${value}`;
	}
	return `https://artificialanalysis.ai/img/logos/${value}`;
}

function asFiniteNumber(value: unknown): number | null {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

function meanOfFinite(values: Array<number | null>): number | null {
	const finiteValues = values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	if (finiteValues.length === 0) {
		return null;
	}
	return (
		finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
	);
}

function firstOpenRouterProvider(modelId: string): string {
	return modelId.split("/")[0] || "";
}

function parseModelCostPerMillion(model: OpenRouterModel): number {
	const inputCost = parseFloat(model.pricing?.prompt || "0");
	const outputCost = parseFloat(model.pricing?.completion || "0");
	return (
		((inputCost * INPUT_PRICE_WEIGHT + outputCost * OUTPUT_PRICE_WEIGHT) /
			(INPUT_PRICE_WEIGHT + OUTPUT_PRICE_WEIGHT)) *
		PRICE_PER_MILLION_TOKENS
	);
}

function leaderboardProviderLogo(row: LeaderboardRow): string | null {
	return (
		toAbsoluteArtificialAnalysisLogoUrl(row.modelCreatorLogo) ??
		(typeof row.modelCreatorSlug === "string" && row.modelCreatorSlug.length > 0
			? artificialAnalysisLogoUrl(row.modelCreatorSlug)
			: null)
	);
}

function modelStatFromModelsDevModel(
	providerId: string,
	modelId: string,
	model: Record<string, any>,
): ModelStat {
	const directModelId =
		typeof model.id === "string" && model.id.length > 0 ? model.id : modelId;
	const fullId =
		typeof directModelId === "string" && directModelId.includes("/")
			? directModelId
			: `${providerId}/${directModelId}`;
	const provider = providerFromModelId(fullId) ?? providerId.toLowerCase();

	return {
		id: fullId,
		name: model.name || modelId,
		provider,
		logo: "",
		fallbackLogo: "",
		cost: model.cost?.output ?? null,
	};
}

function availableModelFromOpenRouterModel(
	model: OpenRouterModel,
): AvailableModel {
	const blendedPrice = parseModelCostPerMillion(model);

	return {
		key: model.id,
		label: `${model.name} ($${blendedPrice.toFixed(2)})`,
		provider: firstOpenRouterProvider(model.id),
		recommended: true,
	};
}

function buildLeaderboardScores(
	rows: LeaderboardRow[],
): Record<string, LeaderboardStat> {
	const scores: Record<string, LeaderboardStat> = {};

	for (const row of rows) {
		const openrouterApiId = row.openrouterApiId;
		if (typeof openrouterApiId !== "string" || !openrouterApiId) {
			continue;
		}

		const intelligenceScore = asFiniteNumber(row.intelligenceIndex);
		const outputSpeed = asFiniteNumber(row.medianOutputTokensPerSecond);
		const timeToFirstToken = asFiniteNumber(
			row.medianTimeToFirstAnswerTokenSeconds ??
				row.medianTimeToFirstTokenSeconds,
		);
		const endToEndLatency = asFiniteNumber(
			row.medianEndToEndResponseTimeSeconds,
		);
		const latencyScore = meanOfFinite([
			timeToFirstToken != null && timeToFirstToken > 0
				? 1000 / timeToFirstToken
				: null,
			endToEndLatency != null && endToEndLatency > 0
				? 1000 / endToEndLatency
				: null,
		]);
		const speedScore = meanOfFinite([outputSpeed, latencyScore]);

		scores[normalizeOpenRouterModelId(openrouterApiId)] = {
			intelligenceScore,
			speedScore,
		};
	}

	return scores;
}

function buildLeaderboardProviderLogos(
	rows: LeaderboardRow[],
): Record<string, ProviderLogoStat> {
	const providerLogos: Record<string, ProviderLogoStat> = {};

	for (const row of rows) {
		const openrouterApiId = row.openrouterApiId;
		if (typeof openrouterApiId !== "string" || !openrouterApiId) {
			continue;
		}

		const provider = providerFromModelId(openrouterApiId);
		if (!provider || providerLogos[provider]) {
			continue;
		}

		const logo = leaderboardProviderLogo(row);
		if (!logo) {
			continue;
		}

		providerLogos[provider] = { logo };
	}

	return providerLogos;
}

export function normalizeOpenRouterModelId(modelId: string): string {
	return modelId
		.trim()
		.toLowerCase()
		.replace(/:[a-z0-9._-]+$/i, "");
}

function decodeFlightChunk(raw: string): string {
	try {
		return JSON.parse(`"${raw}"`) as string;
	} catch {
		return raw;
	}
}

function extractFlightCorpus(pageHtml: string): string {
	const regex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
	return [...pageHtml.matchAll(regex)]
		.map((match) => decodeFlightChunk(match[1] || ""))
		.join("\n");
}

function findObjectEnd(corpus: string, startIndex: number): number {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = startIndex; index < corpus.length; index += 1) {
		const char = corpus[index];
		if (inString) {
			if (escaping) {
				escaping = false;
			} else if (char === "\\") {
				escaping = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth += 1;
			continue;
		}
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
}

function extractLeaderboardRows(pageHtml: string): LeaderboardRow[] {
	const corpus = extractFlightCorpus(pageHtml);
	const rowsById = new Map<string, LeaderboardRow>();
	let cursor = 0;

	while (true) {
		const hitIndex = corpus.indexOf(LEADERBOARD_ROW_TOKEN, cursor);
		if (hitIndex === -1) {
			break;
		}
		cursor = hitIndex + LEADERBOARD_ROW_TOKEN.length;

		const startIndex = corpus.lastIndexOf("{", hitIndex);
		if (startIndex === -1) {
			continue;
		}

		const endIndex = findObjectEnd(corpus, startIndex);
		if (endIndex === -1) {
			continue;
		}

		try {
			const row = JSON.parse(
				corpus.slice(startIndex, endIndex + 1),
			) as LeaderboardRow;
			const openrouterApiId = row.openrouterApiId;
			if (typeof openrouterApiId !== "string" || !openrouterApiId) {
				continue;
			}
			rowsById.set(normalizeOpenRouterModelId(openrouterApiId), row);
		} catch {
			// Ignore malformed rows and continue scanning.
		}
	}

	return [...rowsById.values()];
}

async function fetchLeaderboardRows(): Promise<LeaderboardRow[]> {
	const response = await fetch(LEADERBOARD_URL);
	if (!response.ok) {
		throw new Error("Failed to fetch leaderboard page");
	}
	return extractLeaderboardRows(await response.text());
}

export async function fetchModelStats(): Promise<Record<string, ModelStat>> {
	try {
		const response = await fetch(MODELS_DEV_URL);
		if (!response.ok) throw new Error("Failed to fetch model stats");

		const data = await response.json();
		const stats: Record<string, ModelStat> = {};

		for (const [providerId, provider] of Object.entries(data)) {
			const modelsDevProvider = provider as ModelsDevProvider;
			const models = modelsDevProvider.models || {};

			for (const [modelId, model] of Object.entries(models)) {
				const modelStat = modelStatFromModelsDevModel(
					providerId,
					modelId,
					model as Record<string, any>,
				);
				stats[modelStat.id] = modelStat;
			}
		}

		return stats;
	} catch (error) {
		console.error("Error fetching model stats:", error);
		return {};
	}
}

export async function fetchLeaderboardScores(): Promise<
	Record<string, LeaderboardStat>
> {
	try {
		return buildLeaderboardScores(await fetchLeaderboardRows());
	} catch (error) {
		console.error("Error fetching leaderboard scores:", error);
		return {};
	}
}

export async function fetchLeaderboardProviderLogos(): Promise<
	Record<string, ProviderLogoStat>
> {
	try {
		return buildLeaderboardProviderLogos(await fetchLeaderboardRows());
	} catch (error) {
		console.error("Error fetching leaderboard provider logos:", error);
		return {};
	}
}

export async function fetchDynamicModels(
	maxCost = 5.0,
): Promise<AvailableModel[]> {
	try {
		const response = await fetch(OPENROUTER_MODELS_URL);
		if (!response.ok) return [];
		const data = (await response.json()) as {
			data?: OpenRouterModel[];
		};

		return (data.data || [])
			.filter((model) => {
				const blendedPrice = parseModelCostPerMillion(model);
				return blendedPrice > 0 && blendedPrice <= maxCost;
			})
			.map(availableModelFromOpenRouterModel);
	} catch (e) {
		console.error("Failed to fetch dynamic models", e);
		return [];
	}
}
