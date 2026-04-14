/**
 * Configuration constants for the YouTube Summarizer application
 * ===============================
 *
 * This file contains all configuration options used throughout the application.
 * Model lists are loaded dynamically from the OpenRouter API via fetchDynamicModels().
 */

import { DEFAULTS, FILE_LIMITS, TIMING, UI_BEHAVIOR } from "@/core/constants";

// ================================
// MODEL DEFAULTS
// ================================

export const DEFAULT_SUMMARY_MODEL = DEFAULTS.MODEL_SUMMARIZER;
export const DEFAULT_QUALITY_MODEL = DEFAULTS.MODEL_REFINER;

// ================================
// LANGUAGE CONFIGURATION
// ================================

export const SUPPORTED_LANGUAGES = {
	auto: "🌐 Auto",
	en: "🇺🇸 English",
	"zh-TW": "🇭🇰 Chinese",
} as const;

export const DEFAULT_TARGET_LANGUAGE =
	DEFAULTS.TARGET_LANGUAGE_RECOMMENDED || null;

// ================================
// TRANSLATION CONFIGURATION
// ================================

export const ENABLE_TRANSLATION_DEFAULT = false;

// ================================
// UI CONFIGURATION
// ================================

// Re-export from centralized constants
export const UI_CONFIG = {
	// Streaming configuration
	STREAM_CHUNK_THROTTLE_MS: TIMING.STREAM_CHUNK_THROTTLE_MS,
	MAX_LOG_ENTRIES: UI_BEHAVIOR.MAX_LOG_ENTRIES,

	// Progress configuration
	PROGRESS_UPDATE_INTERVAL: TIMING.PROGRESS_UPDATE_INTERVAL,

	// File size limits (in MB)
	MAX_FILE_SIZE_MB: FILE_LIMITS.MAX_FILE_SIZE_MB,

	// Timeout configurations
	API_TIMEOUT_MS: TIMING.API_TIMEOUT_MS,
	SCRAPING_TIMEOUT_MS: TIMING.SCRAPING_TIMEOUT_MS,

	// Retry configuration
	MAX_RETRIES: 3,
	RETRY_DELAY_MS: 1000,
} as const;

// ================================
// TYPE DEFINITIONS
// ================================

export type ModelKey = string; // Relaxed type to allow custom models
export type LanguageKey = keyof typeof SUPPORTED_LANGUAGES;

export type AvailableModel = {
	key: string;
	label: string;
	provider?: string;
	recommended?: boolean;
	logo?: string;
	fallbackLogo?: string;
	intelligenceScore?: number | null;
	speedMetric?: number | null;
	price?: number | null;
};

export type SupportedLanguage = {
	key: LanguageKey;
	label: string;
	flag?: string;
};

// ================================
// PROVIDER INFERENCE
// ================================

const KNOWN_PROVIDERS = new Set([
	"google",
	"anthropic",
	"openai",
	"x-ai",
	"mistral",
	"meta",
	"cohere",
	"deepseek",
	"perplexity",
	"groq",
]);

export function inferProviderFromModelKey(
	modelKey: string,
): string | undefined {
	const provider = modelKey.split("/")[0];
	if (!provider) return undefined;
	return KNOWN_PROVIDERS.has(provider) ? provider : undefined;
}

// ================================
// LANGUAGE LIST
// ================================

export const SUPPORTED_LANGUAGES_LIST: SupportedLanguage[] = Object.entries(
	SUPPORTED_LANGUAGES,
).map(([key, label]) => {
	const flagRegex = /^([\u{1F1E6}-\u{1F1FF}🌐]+)/u;
	const flagMatch = label.match(flagRegex);
	const flag = flagMatch ? flagMatch[1] : "";
	const cleanLabel = label.replace(flag, "").trim();

	return {
		key: key as LanguageKey,
		label: cleanLabel,
		flag,
	};
});

// ================================
// UTILITY FUNCTIONS
// ================================

export function getLanguageByKey(
	key: LanguageKey,
): SupportedLanguage | undefined {
	return SUPPORTED_LANGUAGES_LIST.find((language) => language.key === key);
}

export function isValidModel(_model: string): boolean {
	// Models are now loaded dynamically, so any model key is potentially valid
	return true;
}

export function isValidLanguage(language: string): language is LanguageKey {
	return language in SUPPORTED_LANGUAGES;
}

// ================================
// VALIDATION
// ================================

export function validateModelSelection(
	summaryModel: string,
	qualityModel: string,
): {
	isValid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	if (!summaryModel) {
		errors.push(`Summary model is required`);
	}

	if (!qualityModel) {
		errors.push(`Quality model is required`);
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

export function validateLanguageSelection(language: string): {
	isValid: boolean;
	error?: string;
} {
	if (!isValidLanguage(language)) {
		return {
			isValid: false,
			error: `Invalid language: ${language}`,
		};
	}

	return { isValid: true };
}

// ================================
// EXPORTS
// ================================

export default {
	DEFAULT_SUMMARY_MODEL,
	DEFAULT_QUALITY_MODEL,
	SUPPORTED_LANGUAGES,
	DEFAULT_TARGET_LANGUAGE,
	ENABLE_TRANSLATION_DEFAULT,
	UI_CONFIG,
	SUPPORTED_LANGUAGES_LIST,
	getLanguageByKey,
	isValidModel,
	isValidLanguage,
	validateModelSelection,
	validateLanguageSelection,
};
