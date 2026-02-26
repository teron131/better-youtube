import { loadConfig } from "./config";
import { DEFAULTS } from "@/core/constants";

// ============================================================================
// Global Config Cache & Variables
// ============================================================================

export interface RuntimeConfigSnapshot {
  openRouterApiKey: string | null;
  geminiApiKey: string | null;
  scrapeCreatorsApiKey: string | null;
  supadataApiKey: string | null;
  summarizerProvider: "auto" | "gemini" | "openrouter";
  summarizerMode: "native" | "validation" | "fast";
  transcriptProviderPreference: "scrapeCreators" | "supadata";
  summarizerModel: string;
  refinerModel: string;
  qualityModel: string;
  targetLanguage: string;
  autoGenerate: boolean;
  showSubtitles: boolean;
  captionFontSize: string;
  summaryFontSize: string;
}

function applySnapshot(config: RuntimeConfigSnapshot): void {
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
 * Load immutable config snapshot for a single request lifecycle.
 */
export async function loadRuntimeConfigSnapshot(): Promise<RuntimeConfigSnapshot> {
  const config = await loadConfig();
  return {
    openRouterApiKey: config.openRouterApiKey,
    geminiApiKey: config.geminiApiKey,
    scrapeCreatorsApiKey: config.scrapeCreatorsApiKey,
    supadataApiKey: config.supadataApiKey,
    summarizerProvider: config.summarizerProvider,
    summarizerMode: config.summarizerMode,
    transcriptProviderPreference: config.transcriptProviderPreference,
    summarizerModel: config.summarizerModel,
    refinerModel: config.refinerModel,
    qualityModel: config.qualityModel,
    targetLanguage: config.targetLanguage,
    autoGenerate: config.autoGenerate,
    showSubtitles: config.showSubtitles,
    captionFontSize: config.captionFontSize,
    summaryFontSize: config.summaryFontSize,
  };
}

/**
 * Initialize all global config variables from storage
 * Should be called once at the start of each request
 */
export async function initGlobalConfig(): Promise<void> {
  const config = await loadRuntimeConfigSnapshot();
  applySnapshot(config);
}

/**
 * Clear config cache and reset all global variables
 * Should be called after each request completes
 */
export function clearConfigCache(): void {
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
