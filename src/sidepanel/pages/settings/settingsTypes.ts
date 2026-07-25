import type { ModelSortMetric } from "@ui/lib/model-sort";
import type { AvailableModel } from "@ui/services/config";
import type { LucideIcon } from "lucide-react";

import type { FontSize } from "@/core/constants";
import { DEFAULTS, STORAGE_KEYS } from "@/core/constants";
import type { LlmModelPrefixMode } from "@/core/llmModelPrefix";

export type ModelCostLimitKey = "summarizerModelCostLimit" | "refinerModelCostLimit";

export const DEFAULT_SETTINGS = {
  llmApiKey: "",
  llmBaseUrl: "",
  llmModelPrefixMode: "provider" as LlmModelPrefixMode,
  geminiApiKey: "",
  summarizerProvider: "auto",
  summarizerMode: "validation",
  summarizerModel: "google/gemini-3-flash-preview",
  refinerModel: "google/gemini-2.5-flash-lite-preview-09-2025",
  summarizerModelCostLimit: Number(DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT),
  refinerModelCostLimit: Number(DEFAULTS.REFINER_MODEL_COST_LIMIT),
  targetLanguage: "auto",
  captionFontSize: "M",
  summaryFontSize: "M",
  autoGenerate: false,
};

export type SettingsState = typeof DEFAULT_SETTINGS;
export type ModelCostLimitInputs = Record<ModelCostLimitKey, string>;
export type SettingsChangeHandler = <K extends keyof SettingsState>(
  key: K,
  value: SettingsState[K],
) => Promise<void> | void;

export type PriceRange = {
  min: number | null;
  max: number | null;
};

export type ModelCostLimitBounds = {
  min: string;
  max?: string;
};

export type ModelSelectorConfig = {
  modelKey: "summarizerModel" | "refinerModel";
  costLimitKey: ModelCostLimitKey;
  label: string;
  icon: LucideIcon;
  options: AvailableModel[];
  priceRange: PriceRange;
  costLimitBounds: ModelCostLimitBounds;
  defaultSortMetric: ModelSortMetric;
  costLimitAriaLabel: string;
};

export type ApiField = {
  key:
    | typeof STORAGE_KEYS.LLM_API_KEY
    | typeof STORAGE_KEYS.LLM_BASE_URL
    | typeof STORAGE_KEYS.GEMINI_API_KEY;
  label: string;
  href?: string;
  placeholder: string;
  type?: "password" | "url";
};

export const FONT_SIZE_OPTIONS: FontSize[] = ["S", "M", "L"];
export const LLM_MODEL_PREFIX_OPTIONS: Array<{
  value: LlmModelPrefixMode;
  label: string;
}> = [
  { value: "provider", label: "provider/model" },
  { value: "none", label: "model" },
];

export const SETTINGS_SECTION_CLASSNAME = "space-y-4 border-t border-border/70 pt-5";

export const API_KEY_FIELDS: ApiField[] = [
  {
    key: STORAGE_KEYS.LLM_API_KEY,
    label: "LLM API Key",
    placeholder: "sk-...",
    type: "password",
  },
  {
    key: STORAGE_KEYS.LLM_BASE_URL,
    label: "LLM Base URL",
    placeholder: "Any OpenAI API compatible base URL, e.g. https://api.openai.com/v1",
    type: "url",
  },
  {
    key: STORAGE_KEYS.GEMINI_API_KEY,
    label: "Gemini API Key",
    href: "https://aistudio.google.com/api-keys",
    placeholder: "...",
    type: "password",
  },
] as const;

export const SETTINGS_STORAGE_KEYS: Record<keyof SettingsState, string> = {
  llmApiKey: STORAGE_KEYS.LLM_API_KEY,
  llmBaseUrl: STORAGE_KEYS.LLM_BASE_URL,
  llmModelPrefixMode: STORAGE_KEYS.LLM_MODEL_PREFIX_MODE,
  geminiApiKey: STORAGE_KEYS.GEMINI_API_KEY,
  summarizerProvider: STORAGE_KEYS.SUMMARIZER_PROVIDER,
  summarizerMode: STORAGE_KEYS.SUMMARIZER_MODE,
  summarizerModel: STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
  refinerModel: STORAGE_KEYS.REFINER_CUSTOM_MODEL,
  summarizerModelCostLimit: STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT,
  refinerModelCostLimit: STORAGE_KEYS.REFINER_MODEL_COST_LIMIT,
  targetLanguage: STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
  captionFontSize: STORAGE_KEYS.CAPTION_FONT_SIZE,
  summaryFontSize: STORAGE_KEYS.SUMMARY_FONT_SIZE,
  autoGenerate: STORAGE_KEYS.AUTO_GENERATE,
};

export const DEFAULT_MODEL_COST_LIMIT_INPUTS: ModelCostLimitInputs = {
  summarizerModelCostLimit: String(DEFAULT_SETTINGS.summarizerModelCostLimit),
  refinerModelCostLimit: String(DEFAULT_SETTINGS.refinerModelCostLimit),
};
