/**
 * Configuration constants for the YouTube Summarizer application
 * ===============================
 *
 * This file contains all configuration options used throughout the application.
 * These values should be kept in sync with the backend configuration.
 */

// ================================
// MODEL CONFIGURATION
// ================================

export const RECOMMENDED_SUMMARIZER_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
  { value: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
] as const;

export const RECOMMENDED_REFINER_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
  { value: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
] as const;

export const AVAILABLE_MODELS = [
  ...RECOMMENDED_SUMMARIZER_MODELS,
  ...RECOMMENDED_REFINER_MODELS,
].reduce(
  (acc, model) => {
    acc[model.value] = model.label;
    return acc;
  },
  {} as Record<string, string>,
);

export const DEFAULT_ANALYSIS_MODEL = "x-ai/grok-4.1-fast";
export const DEFAULT_QUALITY_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";

// ================================
// LANGUAGE CONFIGURATION
// ================================

export const SUPPORTED_LANGUAGES = {
  "auto": "🌐 Auto",
  "en": "🇺🇸 English",
  "zh-TW": "🇭🇰 Chinese",
} as const;

export const DEFAULT_TARGET_LANGUAGE = null;

// ================================
// QUALITY THRESHOLDS
// ================================

export const MIN_QUALITY_SCORE = 90;
export const MAX_ITERATIONS = 2;

// ================================
// TRANSLATION CONFIGURATION
// ================================

export const ENABLE_TRANSLATION_DEFAULT = false;

// ================================
// UI CONFIGURATION
// ================================

export const UI_CONFIG = {
  // Streaming configuration
  STREAM_CHUNK_THROTTLE_MS: 100,
  MAX_LOG_ENTRIES: 100,

  // Progress configuration
  PROGRESS_UPDATE_INTERVAL: 500,

  // File size limits (in MB)
  MAX_FILE_SIZE_MB: 100,

  // Timeout configurations
  API_TIMEOUT_MS: 300000, // 5 minutes
  SCRAPING_TIMEOUT_MS: 120000, // 2 minutes

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
};

export type SupportedLanguage = {
  key: LanguageKey;
  label: string;
  flag?: string;
};

// ================================
// DERIVED DATA
// ================================

const convertToAvailableModel = (
  model: { value: string; label: string },
): AvailableModel => ({
  key: model.value,
  label: model.label,
  provider: inferProviderFromModelKey(model.value),
  recommended: true,
});

const KNOWN_PROVIDERS = new Set(["google", "anthropic", "openai", "x-ai"]);

function inferProviderFromModelKey(modelKey: string): string | undefined {
  const provider = modelKey.split("/")[0];
  if (!provider) return undefined;
  return KNOWN_PROVIDERS.has(provider) ? provider : undefined;
}

export const AVAILABLE_SUMMARIZER_MODELS_LIST: AvailableModel[] =
  RECOMMENDED_SUMMARIZER_MODELS.map(convertToAvailableModel);
export const AVAILABLE_REFINER_MODELS_LIST: AvailableModel[] =
  RECOMMENDED_REFINER_MODELS.map(convertToAvailableModel);

export const AVAILABLE_MODELS_LIST: AvailableModel[] = [
  ...AVAILABLE_SUMMARIZER_MODELS_LIST,
  ...AVAILABLE_REFINER_MODELS_LIST,
].filter((model, index, self) => index === self.findIndex((m) => m.key === model.key));

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

export function getModelByKey(key: ModelKey): AvailableModel | undefined {
  return AVAILABLE_MODELS_LIST.find((model) => model.key === key);
}

export function getLanguageByKey(key: LanguageKey): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES_LIST.find((language) => language.key === key);
}

export function isValidModel(model: string): boolean {
  return true;
}

export function isValidLanguage(language: string): language is LanguageKey {
  return language in SUPPORTED_LANGUAGES;
}

// ================================
// VALIDATION
// ================================

export function validateModelSelection(analysisModel: string, qualityModel: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!analysisModel) {
    errors.push(`Analysis model is required`);
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
  AVAILABLE_MODELS,
  RECOMMENDED_SUMMARIZER_MODELS,
  RECOMMENDED_REFINER_MODELS,
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_QUALITY_MODEL,
  SUPPORTED_LANGUAGES,
  DEFAULT_TARGET_LANGUAGE,
  MIN_QUALITY_SCORE,
  MAX_ITERATIONS,
  ENABLE_TRANSLATION_DEFAULT,
  UI_CONFIG,
  AVAILABLE_MODELS_LIST,
  AVAILABLE_SUMMARIZER_MODELS_LIST,
  AVAILABLE_REFINER_MODELS_LIST,
  SUPPORTED_LANGUAGES_LIST,
  getModelByKey,
  getLanguageByKey,
  isValidModel,
  isValidLanguage,
  validateModelSelection,
  validateLanguageSelection,
};
