/** Owns validation and storage-backed loading for extension configuration across browser contexts. */

import type { FontSize } from "./constants.ts";
import { DEFAULTS, STORAGE_KEYS } from "./constants.ts";
import type { LlmModelPrefixMode } from "./llmModelPrefix.ts";
import { getStorageValues } from "./storage.ts";

// ============================================================================
// Types
// ============================================================================

export type SummarizerProviderPreference = "auto" | "gemini" | "llm";
export type SummarizerModePreference = "native" | "validation" | "fast";

export interface AppConfig {
  // API Keys (nullable)
  llmApiKey: string | null;
  llmBaseUrl: string | null;
  llmModelPrefixMode: LlmModelPrefixMode;
  geminiApiKey: string | null;

  // Routing
  summarizerProvider: "auto" | "gemini" | "llm";
  summarizerMode: "native" | "validation" | "fast";

  // Model selections
  summarizerModel: string;
  refinerModel: string;
  qualityModel: string;
  summarizerModelCostLimit: number;
  refinerModelCostLimit: number;

  // UI preferences
  targetLanguage: string;
  autoGenerate: boolean;
  showSubtitles: boolean;
  captionFontSize: FontSize;
  summaryFontSize: FontSize;
}

type StoredValues = Record<string, any>;

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLlmModelPrefixMode(value: unknown): LlmModelPrefixMode {
  return value === "none" || value === "custom" ? "none" : "provider";
}

export function normalizeModelCostLimit(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT;
  }

  return Number.parseFloat(numericValue.toFixed(2));
}

function resolveModelCostLimit(value: unknown, defaultValue: number): number {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Number.parseFloat(numericValue.toFixed(2));
  }

  return defaultValue;
}

/**
 * Resolve model from custom/recommended/default hierarchy
 */
function resolveModel(
  customModel: string | null | undefined,
  recommendedModel: string | null | undefined,
  defaultModel: string,
): string {
  return customModel || recommendedModel || defaultModel;
}

function resolveQualityModel(
  storedQualityModel: string | null | undefined,
  refinerCustomModel: string | null | undefined,
  refinerRecommendedModel: string | null | undefined,
  defaultModel: string,
): string {
  return (
    storedQualityModel || resolveModel(refinerCustomModel, refinerRecommendedModel, defaultModel)
  );
}

function resolveStoredModelCostLimits(
  result: StoredValues,
): Pick<AppConfig, "summarizerModelCostLimit" | "refinerModelCostLimit"> {
  return {
    summarizerModelCostLimit: resolveModelCostLimit(
      result[STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT],
      DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT,
    ),
    refinerModelCostLimit: resolveModelCostLimit(
      result[STORAGE_KEYS.REFINER_MODEL_COST_LIMIT],
      DEFAULTS.REFINER_MODEL_COST_LIMIT,
    ),
  };
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
    STORAGE_KEYS.LLM_MODEL_PREFIX_MODE,
    STORAGE_KEYS.GEMINI_API_KEY,
    STORAGE_KEYS.SUMMARIZER_PROVIDER,
    STORAGE_KEYS.SUMMARIZER_MODE,
    STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
    STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
    STORAGE_KEYS.QUALITY_MODEL,
    STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT,
    STORAGE_KEYS.REFINER_MODEL_COST_LIMIT,
    STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
    STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.SHOW_SUBTITLES,
    STORAGE_KEYS.CAPTION_FONT_SIZE,
    STORAGE_KEYS.SUMMARY_FONT_SIZE,
  ];

  const result = await getStorageValues<StoredValues>(keys);

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
    llmModelPrefixMode: normalizeLlmModelPrefixMode(result[STORAGE_KEYS.LLM_MODEL_PREFIX_MODE]),
    geminiApiKey: normalizeKey(result[STORAGE_KEYS.GEMINI_API_KEY]),

    summarizerProvider,
    summarizerMode,

    summarizerModel,
    refinerModel,
    qualityModel: resolveQualityModel(
      result[STORAGE_KEYS.QUALITY_MODEL],
      result[STORAGE_KEYS.REFINER_CUSTOM_MODEL],
      result[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL],
      summarizerModel,
    ),
    ...resolveStoredModelCostLimits(result),

    targetLanguage: resolveModel(
      result[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM],
      result[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED],
      DEFAULTS.TARGET_LANGUAGE_RECOMMENDED,
    ),
    autoGenerate: result[STORAGE_KEYS.AUTO_GENERATE] ?? DEFAULTS.AUTO_GENERATE,
    showSubtitles: result[STORAGE_KEYS.SHOW_SUBTITLES] ?? DEFAULTS.SHOW_SUBTITLES,
    captionFontSize: result[STORAGE_KEYS.CAPTION_FONT_SIZE] ?? DEFAULTS.CAPTION_FONT_SIZE,
    summaryFontSize: result[STORAGE_KEYS.SUMMARY_FONT_SIZE] ?? DEFAULTS.SUMMARY_FONT_SIZE,
  };
}
