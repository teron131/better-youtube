/**
 * Centralized Configuration Module
 * Single source of truth for all application configuration
 */

import type { FontSize } from "./constants";
import { DEFAULTS, STORAGE_KEYS } from "./constants";
import { getStorageValues } from "./storage";

// ============================================================================
// Types
// ============================================================================

export type SummarizerProviderPreference = "auto" | "gemini" | "llm";
export type SummarizerModePreference = "native" | "validation" | "fast";
export type TranscriptProviderPreference = "scrapeCreators" | "supadata";

export interface AppConfig {
	// API Keys (nullable)
	llmApiKey: string | null;
	llmBaseUrl: string | null;
	geminiApiKey: string | null;
	scrapeCreatorsApiKey: string | null;
	supadataApiKey: string | null;

	// Routing
	summarizerProvider: "auto" | "gemini" | "llm";
	summarizerMode: "native" | "validation" | "fast";
	transcriptProviderPreference: "scrapeCreators" | "supadata";

	// Model selections
	summarizerModel: string;
	refinerModel: string;
	qualityModel: string;

	// UI preferences
	targetLanguage: string;
	autoGenerate: boolean;
	showSubtitles: boolean;
	captionFontSize: FontSize;
	summaryFontSize: FontSize;
}

export interface ApiKeys {
	llmApiKey: string | null;
	llmBaseUrl: string | null;
	geminiApiKey: string | null;
	scrapeCreatorsApiKey: string | null;
	supadataApiKey: string | null;
}

export interface ModelConfig {
	summarizerModel: string;
	refinerModel: string;
	qualityModel: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeKey(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

/**
 * Resolve model from custom/recommended/default hierarchy
 */
export function resolveModel(
	customModel: string | null | undefined,
	recommendedModel: string | null | undefined,
	defaultModel: string,
): string {
	return customModel || recommendedModel || defaultModel;
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load all configuration from storage in a single batch operation
 * No caching - always fetches fresh values from storage
 */
export async function loadConfig(): Promise<AppConfig> {
	const keys = [
		STORAGE_KEYS.LLM_API_KEY,
		STORAGE_KEYS.LLM_BASE_URL,
		STORAGE_KEYS.GEMINI_API_KEY,
		STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
		STORAGE_KEYS.SUPADATA_API_KEY,
		STORAGE_KEYS.SUMMARIZER_PROVIDER,
		STORAGE_KEYS.SUMMARIZER_MODE,
		STORAGE_KEYS.TRANSCRIPT_PROVIDER_PREFERENCE,
		STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
		STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
		STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
		STORAGE_KEYS.REFINER_CUSTOM_MODEL,
		STORAGE_KEYS.QUALITY_MODEL,
		STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
		STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
		STORAGE_KEYS.AUTO_GENERATE,
		STORAGE_KEYS.SHOW_SUBTITLES,
		STORAGE_KEYS.CAPTION_FONT_SIZE,
		STORAGE_KEYS.SUMMARY_FONT_SIZE,
	];

	const result = await getStorageValues<Record<string, any>>(keys);

	const providerRaw = String(
		result[STORAGE_KEYS.SUMMARIZER_PROVIDER] ?? DEFAULTS.SUMMARIZER_PROVIDER,
	);
	const summarizerProvider: "auto" | "gemini" | "llm" =
		providerRaw === "gemini" || providerRaw === "llm" ? providerRaw : "auto";

	const modeRaw = String(result[STORAGE_KEYS.SUMMARIZER_MODE] ?? "");
	const summarizerMode: "native" | "validation" | "fast" =
		modeRaw === "native" || modeRaw === "validation" || modeRaw === "fast"
			? modeRaw
			: DEFAULTS.SUMMARIZER_MODE;

	const transcriptPrefRaw = String(
		result[STORAGE_KEYS.TRANSCRIPT_PROVIDER_PREFERENCE] ??
			DEFAULTS.TRANSCRIPT_PROVIDER_PREFERENCE,
	);
	const transcriptProviderPreference: "scrapeCreators" | "supadata" =
		transcriptPrefRaw === "supadata" ? "supadata" : "scrapeCreators";

	const summarizerModel = resolveModel(
		result[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL],
		result[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL],
		DEFAULTS.MODEL_SUMMARIZER,
	);

	const refinerModel = resolveModel(
		result[STORAGE_KEYS.REFINER_CUSTOM_MODEL],
		result[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL],
		DEFAULTS.MODEL_REFINER,
	);

	return {
		llmApiKey: normalizeKey(result[STORAGE_KEYS.LLM_API_KEY]),
		llmBaseUrl: normalizeKey(result[STORAGE_KEYS.LLM_BASE_URL]),
		geminiApiKey: normalizeKey(result[STORAGE_KEYS.GEMINI_API_KEY]),
		scrapeCreatorsApiKey: normalizeKey(
			result[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY],
		),
		supadataApiKey: normalizeKey(result[STORAGE_KEYS.SUPADATA_API_KEY]),

		summarizerProvider,
		summarizerMode,
		transcriptProviderPreference,

		summarizerModel,
		refinerModel,
		qualityModel: result[STORAGE_KEYS.QUALITY_MODEL] || summarizerModel,

		targetLanguage: resolveModel(
			result[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM],
			result[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED],
			DEFAULTS.TARGET_LANGUAGE_RECOMMENDED,
		),
		autoGenerate: result[STORAGE_KEYS.AUTO_GENERATE] ?? DEFAULTS.AUTO_GENERATE,
		showSubtitles:
			result[STORAGE_KEYS.SHOW_SUBTITLES] ?? DEFAULTS.SHOW_SUBTITLES,
		captionFontSize:
			result[STORAGE_KEYS.CAPTION_FONT_SIZE] ?? DEFAULTS.CAPTION_FONT_SIZE,
		summaryFontSize:
			result[STORAGE_KEYS.SUMMARY_FONT_SIZE] ?? DEFAULTS.SUMMARY_FONT_SIZE,
	};
}

/**
 * Load only API keys from storage
 */
export async function getApiKeys(): Promise<ApiKeys> {
	const keys = [
		STORAGE_KEYS.LLM_API_KEY,
		STORAGE_KEYS.LLM_BASE_URL,
		STORAGE_KEYS.GEMINI_API_KEY,
		STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
		STORAGE_KEYS.SUPADATA_API_KEY,
	];

	const result = await getStorageValues<Record<string, any>>(keys);

	return {
		llmApiKey: normalizeKey(result[STORAGE_KEYS.LLM_API_KEY]),
		llmBaseUrl: normalizeKey(result[STORAGE_KEYS.LLM_BASE_URL]),
		geminiApiKey: normalizeKey(result[STORAGE_KEYS.GEMINI_API_KEY]),
		scrapeCreatorsApiKey: normalizeKey(
			result[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY],
		),
		supadataApiKey: normalizeKey(result[STORAGE_KEYS.SUPADATA_API_KEY]),
	};
}

/**
 * Load only model configuration from storage
 */
export async function getModelConfig(): Promise<ModelConfig> {
	const keys = [
		STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
		STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
		STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
		STORAGE_KEYS.REFINER_CUSTOM_MODEL,
		STORAGE_KEYS.QUALITY_MODEL,
	];

	const result = await getStorageValues<Record<string, any>>(keys);

	const summarizerModel = resolveModel(
		result[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL],
		result[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL],
		DEFAULTS.MODEL_SUMMARIZER,
	);

	return {
		summarizerModel,
		refinerModel: resolveModel(
			result[STORAGE_KEYS.REFINER_CUSTOM_MODEL],
			result[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL],
			DEFAULTS.MODEL_REFINER,
		),
		qualityModel: result[STORAGE_KEYS.QUALITY_MODEL] || summarizerModel,
	};
}
