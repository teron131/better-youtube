/**
 * Model Statistics and Logo Service
 * Fetches model metadata, leaderboard scores, and logos from remote sources.
 */

import type { AvailableModel } from "./config";

const MODELS_DEV_URL = "https://models.dev/api.json";
const LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";
const LEADERBOARD_ROW_TOKEN = '"openrouterApiId":"';
const ARTIFICIAL_ANALYSIS_LOGO_URL = "https://artificialanalysis.ai/img/logos";

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

function buildLeaderboardScores(
	rows: Record<string, unknown>[],
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
	rows: Record<string, unknown>[],
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

		const logo =
			toAbsoluteArtificialAnalysisLogoUrl(row.modelCreatorLogo) ??
			(typeof row.modelCreatorSlug === "string" &&
			row.modelCreatorSlug.length > 0
				? artificialAnalysisLogoUrl(row.modelCreatorSlug)
				: null);
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

function extractLeaderboardRows(pageHtml: string): Record<string, unknown>[] {
	const corpus = extractFlightCorpus(pageHtml);
	const rowsById = new Map<string, Record<string, unknown>>();
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
			const row = JSON.parse(corpus.slice(startIndex, endIndex + 1)) as Record<
				string,
				unknown
			>;
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

export async function fetchModelStats(): Promise<Record<string, ModelStat>> {
	try {
		const response = await fetch(MODELS_DEV_URL);
		if (!response.ok) throw new Error("Failed to fetch model stats");

		const data = await response.json();
		const stats: Record<string, ModelStat> = {};

		for (const [providerId, provider] of Object.entries(data)) {
			const p = provider as any;
			const models = p.models || {};

			const cleanProviderId = providerId.toLowerCase();

			for (const [modelId, model] of Object.entries(models)) {
				const m = model as any;
				const directModelId =
					typeof m.id === "string" && m.id.length > 0 ? m.id : modelId;
				const fullId =
					typeof directModelId === "string" && directModelId.includes("/")
						? directModelId
						: `${providerId}/${directModelId}`;
				const modelProvider = providerFromModelId(fullId) ?? cleanProviderId;

				stats[fullId] = {
					id: fullId,
					name: m.name || modelId,
					provider: modelProvider ?? cleanProviderId,
					logo: "",
					fallbackLogo: "",
					cost: m.cost?.output ?? null,
				};
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
		const response = await fetch(LEADERBOARD_URL);
		if (!response.ok) {
			throw new Error("Failed to fetch leaderboard scores");
		}

		const pageHtml = await response.text();
		const rows = extractLeaderboardRows(pageHtml);
		return buildLeaderboardScores(rows);
	} catch (error) {
		console.error("Error fetching leaderboard scores:", error);
		return {};
	}
}

export async function fetchLeaderboardProviderLogos(): Promise<
	Record<string, ProviderLogoStat>
> {
	try {
		const response = await fetch(LEADERBOARD_URL);
		if (!response.ok) {
			throw new Error("Failed to fetch leaderboard provider logos");
		}

		const pageHtml = await response.text();
		const rows = extractLeaderboardRows(pageHtml);
		return buildLeaderboardProviderLogos(rows);
	} catch (error) {
		console.error("Error fetching leaderboard provider logos:", error);
		return {};
	}
}

export async function fetchDynamicModels(
	maxCost = 5.0,
): Promise<AvailableModel[]> {
	try {
		const response = await fetch("https://openrouter.ai/api/v1/models");
		if (!response.ok) return [];
		const data = (await response.json()) as any;

		const models = (data.data || []).map((m: any) => {
			const input = parseFloat(m.pricing?.prompt || "0");
			const output = parseFloat(m.pricing?.completion || "0");
			const blended = ((input * 3 + output) / 4) * 1000000;
			return {
				...m,
				blendedPrice: blended,
			};
		});

		const underBudget = models.filter(
			(m: any) => m.blendedPrice > 0 && m.blendedPrice <= maxCost,
		);

		return underBudget.map((m: any) => {
			const provider = m.id.split("/")[0];
			return {
				key: m.id,
				label: `${m.name} ($${m.blendedPrice.toFixed(2)})`,
				provider,
				recommended: true,
			};
		});
	} catch (e) {
		console.error("Failed to fetch dynamic models", e);
		return [];
	}
}
