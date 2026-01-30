/** Storage-related helper functions */

import { DEFAULTS, STORAGE_KEYS } from "@/core/constants";

export function buildStorageKeysForVideo(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
    STORAGE_KEYS.SUPADATA_API_KEY,
    STORAGE_KEYS.OPENROUTER_API_KEY,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
    STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
    STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
    STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
    STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
    STORAGE_KEYS.SHOW_SUBTITLES,
    STORAGE_KEYS.FAST_MODE,
    STORAGE_KEYS.QUALITY_MODEL,
  ];
}

export function getRefinerModelFromStorage(storageResult: any): string {
  return (
    storageResult[STORAGE_KEYS.REFINER_CUSTOM_MODEL] ||
    storageResult[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL] ||
    DEFAULTS.MODEL_REFINER
  );
}

export function getAutoGenModels(storageResult: any): {
  summarizerModel: string;
  qualityModel: string;
  targetLanguage: string;
  fastMode: boolean;
} {
  const summarizerModel =
    storageResult[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
    storageResult[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL] ||
    DEFAULTS.MODEL_SUMMARIZER;
  return {
    summarizerModel,
    qualityModel: storageResult[STORAGE_KEYS.QUALITY_MODEL] || summarizerModel,
    targetLanguage: getTargetLanguageFromStorage(storageResult),
    fastMode: storageResult[STORAGE_KEYS.FAST_MODE] === true,
  };
}

export function getTargetLanguageFromStorage(storageResult: any): string {
  return (
    storageResult[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
    storageResult[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED] ||
    DEFAULTS.TARGET_LANGUAGE_RECOMMENDED
  );
}

export function buildStorageKeysForToggle(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
    STORAGE_KEYS.SUPADATA_API_KEY,
    STORAGE_KEYS.OPENROUTER_API_KEY,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
  ];
}
