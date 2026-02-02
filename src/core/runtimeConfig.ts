import type { AppConfig } from "./config";
import { loadConfig } from "./config";

// ============================================================================
// Global Config Cache & Variables
// ============================================================================

let cachedConfig: AppConfig | null = null;

// Global variables (exported, request-scoped)
export let globalOpenRouterKey: string | null = null;
export let globalGeminiKey: string | null = null;
export let globalScrapeCreatorsKey: string | null = null;
export let globalSupadataKey: string | null = null;
export let globalSummarizerModel: string = "";
export let globalRefinerModel: string = "";
export let globalQualityModel: string = "";
export let globalTargetLanguage: string = "";
export let globalAutoGenerate: boolean = false;
export let globalShowSubtitles: boolean = false;
export let globalFastMode: boolean = false;
export let globalCaptionFontSize: string = "";
export let globalSummaryFontSize: string = "";
export let globalSummarizerProvider: "auto" | "gemini" | "openrouter" = "auto";
export let globalSummarizerMode: "native" | "react" | "fast" = "react";
export let globalTranscriptProviderPreference: "scrapeCreators" | "supadata" =
  "scrapeCreators";

/**
 * Initialize all global config variables from storage
 * Should be called once at the start of each request
 */
export async function initGlobalConfig(): Promise<void> {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
  }

  globalOpenRouterKey = cachedConfig.openRouterApiKey;
  globalGeminiKey = cachedConfig.geminiApiKey;
  globalScrapeCreatorsKey = cachedConfig.scrapeCreatorsApiKey;
  globalSupadataKey = cachedConfig.supadataApiKey;
  globalSummarizerProvider = cachedConfig.summarizerProvider;
  globalSummarizerMode = cachedConfig.summarizerMode;
  globalTranscriptProviderPreference =
    cachedConfig.transcriptProviderPreference;
  globalSummarizerModel = cachedConfig.summarizerModel;
  globalRefinerModel = cachedConfig.refinerModel;
  globalQualityModel = cachedConfig.qualityModel;
  globalTargetLanguage = cachedConfig.targetLanguage;
  globalAutoGenerate = cachedConfig.autoGenerate;
  globalShowSubtitles = cachedConfig.showSubtitles;
  globalFastMode = cachedConfig.fastMode;
  globalCaptionFontSize = cachedConfig.captionFontSize;
  globalSummaryFontSize = cachedConfig.summaryFontSize;
}

/**
 * Clear config cache and reset all global variables
 * Should be called after each request completes
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  globalOpenRouterKey = null;
  globalGeminiKey = null;
  globalScrapeCreatorsKey = null;
  globalSupadataKey = null;
  globalSummarizerModel = "";
  globalRefinerModel = "";
  globalQualityModel = "";
  globalTargetLanguage = "";
  globalAutoGenerate = false;
  globalShowSubtitles = false;
  globalFastMode = false;
  globalCaptionFontSize = "";
  globalSummaryFontSize = "";

  globalSummarizerProvider = "auto";
  globalSummarizerMode = "react";
  globalTranscriptProviderPreference = "scrapeCreators";
}

// ============================================================================
// Individual Getters (Backward Compatibility)
// ============================================================================

export async function getOpenRouterApiKey(): Promise<string | null> {
  await initGlobalConfig();
  return globalOpenRouterKey;
}

export async function getGeminiApiKey(): Promise<string | null> {
  await initGlobalConfig();
  return globalGeminiKey;
}

export async function getScrapeCreatorsApiKey(): Promise<string | null> {
  await initGlobalConfig();
  return globalScrapeCreatorsKey;
}

export async function getSupadataApiKey(): Promise<string | null> {
  await initGlobalConfig();
  return globalSupadataKey;
}
