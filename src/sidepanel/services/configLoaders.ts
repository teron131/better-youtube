/**
 * Configuration Loaders for Sidepanel
 * Centralized functions to load API keys and model settings from storage
 */

import { DEFAULTS, STORAGE_KEYS } from '@/lib/constants';

/**
 * Get API keys from chrome.storage
 */
export async function getApiKeys(): Promise<{
  scrapeCreatorsApiKey: string;
  openRouterApiKey: string;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [STORAGE_KEYS.SCRAPE_CREATORS_API_KEY, STORAGE_KEYS.OPENROUTER_API_KEY],
      (result) => {
        resolve({
          scrapeCreatorsApiKey: result[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY] || '',
          openRouterApiKey: result[STORAGE_KEYS.OPENROUTER_API_KEY] || '',
        });
      }
    );
  });
}

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
 * Get combined configuration (API keys + model settings)
 */
export async function getProcessingConfig(): Promise<{
  scrapeCreatorsApiKey: string;
  openRouterApiKey: string;
  summarizerModel: string;
  refinerModel: string;
  targetLanguage: string;
  showSubtitles: boolean;
}> {
  const [apiKeys, modelSettings] = await Promise.all([getApiKeys(), getModelSettings()]);
  return { ...apiKeys, ...modelSettings };
}
