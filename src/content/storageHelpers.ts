/** Storage-related helper functions */

import { loadConfig } from "@/core/config";
import { STORAGE_KEYS } from "@/core/constants";

export function getVideoStorageKeys(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.LLM_API_KEY,
    STORAGE_KEYS.GEMINI_API_KEY,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
    STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
    STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
    STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
    STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
    STORAGE_KEYS.SHOW_SUBTITLES,
    STORAGE_KEYS.SUMMARIZER_MODE,
    STORAGE_KEYS.QUALITY_MODEL,
  ];
}

export async function getRefinerModel(): Promise<string> {
  return (await loadConfig()).refinerModel;
}

export function getToggleStorageKeys(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.LLM_API_KEY,
    STORAGE_KEYS.GEMINI_API_KEY,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
  ];
}
