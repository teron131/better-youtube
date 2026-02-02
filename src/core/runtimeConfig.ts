import { loadConfig, type AppConfig } from "./config";
import { DEFAULTS } from "@/core/constants";

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
export let globalCaptionFontSize: string = "";
export let globalSummaryFontSize: string = "";
export let globalSummarizerProvider: "auto" | "gemini" | "openrouter" = "auto";
export let globalSummarizerMode: "native" | "validation" | "fast" =
  DEFAULTS.SUMMARIZER_MODE;
export let globalTranscriptProviderPreference: "scrapeCreators" | "supadata" =
  "scrapeCreators";

/**
 * Initialize all global config variables from storage
 * Should be called once at the start of each request
 */
export async function initGlobalConfig(): Promise<void> {
  const config = await loadConfig();

  globalOpenRouterKey = config.openRouterApiKey;
  globalGeminiKey = config.geminiApiKey;
  globalScrapeCreatorsKey = config.scrapeCreatorsApiKey;
  globalSupadataKey = config.supadataApiKey;
  globalSummarizerProvider = config.summarizerProvider;
  globalSummarizerMode = config.summarizerMode;
  globalTranscriptProviderPreference = config.transcriptProviderPreference;
  globalSummarizerModel = config.summarizerModel;
  globalRefinerModel = config.refinerModel;
  globalQualityModel = config.qualityModel;
  globalTargetLanguage = config.targetLanguage;
  globalAutoGenerate = config.autoGenerate;
  globalShowSubtitles = config.showSubtitles;
  globalCaptionFontSize = config.captionFontSize;
  globalSummaryFontSize = config.summaryFontSize;
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
  globalCaptionFontSize = "";
  globalSummaryFontSize = "";

  globalSummarizerProvider = "auto";
  globalSummarizerMode = DEFAULTS.SUMMARIZER_MODE;
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
