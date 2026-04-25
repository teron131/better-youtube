import { loadConfig } from "./config.ts";
import { DEFAULTS } from "./constants.ts";
import type { LlmModelPrefixMode } from "./llmModelPrefix.ts";

// ============================================================================
// Global Config Cache & Variables
// ============================================================================

export interface RuntimeConfigSnapshot {
	llmApiKey: string | null;
	llmBaseUrl: string | null;
	llmModelPrefixMode: LlmModelPrefixMode;
	geminiApiKey: string | null;
	summarizerProvider: "auto" | "gemini" | "llm";
	summarizerMode: "native" | "validation" | "fast";
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
	globalLlmApiKey = config.llmApiKey;
	globalLlmBaseUrl = config.llmBaseUrl;
	globalLlmModelPrefixMode = config.llmModelPrefixMode;
	globalGeminiKey = config.geminiApiKey;
	globalSummarizerProvider = config.summarizerProvider;
	globalSummarizerMode = config.summarizerMode;
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
export let globalLlmApiKey: string | null = null;
export let globalLlmBaseUrl: string | null = null;
export let globalLlmModelPrefixMode: LlmModelPrefixMode = "provider";
export let globalGeminiKey: string | null = null;
export let globalSummarizerModel: string = "";
export let globalRefinerModel: string = "";
export let globalQualityModel: string = "";
export let globalTargetLanguage: string = "";
export let globalAutoGenerate: boolean = false;
export let globalShowSubtitles: boolean = false;
export let globalCaptionFontSize: string = "";
export let globalSummaryFontSize: string = "";
export let globalSummarizerProvider: "auto" | "gemini" | "llm" = "auto";
export let globalSummarizerMode: "native" | "validation" | "fast" =
	DEFAULTS.SUMMARIZER_MODE;

/**
 * Load immutable config snapshot for a single request lifecycle.
 */
export async function loadRuntimeConfigSnapshot(): Promise<RuntimeConfigSnapshot> {
	const config = await loadConfig();
	return {
		llmApiKey: config.llmApiKey,
		llmBaseUrl: config.llmBaseUrl,
		llmModelPrefixMode: config.llmModelPrefixMode,
		geminiApiKey: config.geminiApiKey,
		summarizerProvider: config.summarizerProvider,
		summarizerMode: config.summarizerMode,
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

let isConfigInitialized = false;

/**
 * Initialize all global config variables from storage
 * Should be called once at the start of each request
 * Uses a flag to prevent redundant re-initialization within the same request lifecycle
 */
export async function initGlobalConfig(force = false): Promise<void> {
	if (isConfigInitialized && !force) return;
	const config = await loadRuntimeConfigSnapshot();
	applySnapshot(config);
	isConfigInitialized = true;
}

/**
 * Clear config cache and reset all global variables
 */
export function clearConfigCache(): void {
	isConfigInitialized = false;
	globalLlmApiKey = null;
	globalLlmBaseUrl = null;
	globalLlmModelPrefixMode = "provider";
	globalGeminiKey = null;
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
}

// ============================================================================
// Individual Getters (Backward Compatibility)
// ============================================================================

export async function getLlmApiKey(): Promise<string | null> {
	await initGlobalConfig();
	return globalLlmApiKey;
}

export async function getLlmBaseUrl(): Promise<string | null> {
	await initGlobalConfig();
	return globalLlmBaseUrl;
}

export async function getGeminiApiKey(): Promise<string | null> {
	await initGlobalConfig();
	return globalGeminiKey;
}
