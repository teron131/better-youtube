/**
 * Shared sidepanel model and language configuration.
 */

import { DEFAULTS } from "@/core/constants";

import type { ModelModalities } from "./model-modalities";

// ================================
// MODEL DEFAULTS
// ================================

export const DEFAULT_SUMMARY_MODEL = DEFAULTS.MODEL_SUMMARIZER;
export const DEFAULT_REFINER_MODEL = DEFAULTS.MODEL_REFINER;

// ================================
// LANGUAGE CONFIGURATION
// ================================

export const SUPPORTED_LANGUAGES = {
  auto: "🌐 Auto",
  en: "🇺🇸 English",
  "zh-TW": "🇭🇰 Chinese",
} as const;

export const DEFAULT_TARGET_LANGUAGE = DEFAULTS.TARGET_LANGUAGE_RECOMMENDED || null;

// ================================
// TYPE DEFINITIONS
// ================================

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
  modalities?: ModelModalities;
};
