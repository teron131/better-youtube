/**
 * Configuration Loaders for Sidepanel
 * Centralized functions to load model settings from storage
 */

import { loadConfig } from "@/core/config";

/**
 * Get model settings from storage
 */
export async function getModelSettings(): Promise<{
	summarizerModel: string;
	refinerModel: string;
	targetLanguage: string;
	showSubtitles: boolean;
	summarizerProvider: "auto" | "gemini" | "openrouter";
	summarizerMode: "native" | "validation" | "fast";
	transcriptProviderPreference: "scrapeCreators" | "supadata";
}> {
	const config = await loadConfig();
	return {
		summarizerModel: config.summarizerModel,
		refinerModel: config.refinerModel,
		targetLanguage: config.targetLanguage,
		showSubtitles: config.showSubtitles,
		summarizerProvider: config.summarizerProvider,
		summarizerMode: config.summarizerMode,
		transcriptProviderPreference: config.transcriptProviderPreference,
	};
}

/**
 * Get combined configuration (model settings)
 */
export async function getProcessingConfig(): Promise<{
	summarizerModel: string;
	refinerModel: string;
	targetLanguage: string;
	showSubtitles: boolean;
	summarizerProvider: "auto" | "gemini" | "openrouter";
	summarizerMode: "native" | "validation" | "fast";
	transcriptProviderPreference: "scrapeCreators" | "supadata";
}> {
	return await getModelSettings();
}
