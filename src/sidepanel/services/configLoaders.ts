/**
 * Configuration Loaders for Sidepanel
 * Centralized functions to load model settings from storage
 */

import { DEFAULTS, STORAGE_KEYS } from '@/lib/constants';

/**
 * Get model settings from chrome.storage
 */
export async function getModelSettings(): Promise<{
  summarizerModel: string;
  refinerModel: string;
  targetLanguage: string;
  showSubtitles: boolean;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
        STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
        STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
        STORAGE_KEYS.REFINER_CUSTOM_MODEL,
        STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
        STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
        STORAGE_KEYS.SHOW_SUBTITLES,
      ],
      (result) => {
        const summarizerModel =
          result[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
          result[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL] ||
          DEFAULTS.MODEL_SUMMARIZER;
        const refinerModel =
          result[STORAGE_KEYS.REFINER_CUSTOM_MODEL] ||
          result[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL] ||
          DEFAULTS.MODEL_REFINER;
        const targetLanguage =
          result[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
          result[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED] ||
          DEFAULTS.TARGET_LANGUAGE_RECOMMENDED;
        const showSubtitles = result[STORAGE_KEYS.SHOW_SUBTITLES] !== false;

        resolve({ summarizerModel, refinerModel, targetLanguage, showSubtitles });
      }
    );
  });
}

/**
 * Get combined configuration (model settings)
 */
export async function getProcessingConfig(): Promise<{
  summarizerModel: string;
  refinerModel: string;
  targetLanguage: string;
  showSubtitles: boolean;
}> {
  return await getModelSettings();
}
