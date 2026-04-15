/**
 * Shared sidepanel model and language configuration.
 */

import { DEFAULTS } from "@/core/constants";

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
// TYPE DEFINITIONS
// ================================

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
