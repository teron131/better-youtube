/**
 * Content Script Helper Functions
 * Extracted logic for reducing nesting and improving readability
 */

import { sendChromeMessage } from "@/lib/chromeUtils";
import { DEFAULTS, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/lib/constants";
import { extractVideoId } from "@/lib/url";

/**
 * Validate load context for subtitle initialization
 * Returns early if conditions aren't met
 */
export function validateLoadContext(): { isValid: boolean; videoId?: string } {
  if (!window.location.href.includes("youtube.com/watch")) {
    console.log("Not on a video page, skipping subtitle load.");
    return { isValid: false };
  }

  const videoId = extractVideoId(window.location.href);
  if (!videoId) {
    console.warn("Could not extract video ID, skipping subtitle load.");
    return { isValid: false };
  }

  return { isValid: true, videoId };
}

/**
 * Build storage keys for subtitle loading
 */
export function buildStorageKeysForVideo(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
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

/**
 * Get refiner model from storage
 */
export function getRefinerModelFromStorage(storageResult: any): string {
  const customModel = storageResult[STORAGE_KEYS.REFINER_CUSTOM_MODEL] as string | undefined;
  if (customModel) return customModel;

  const recommendedModel = storageResult[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL] as string | undefined;
  return recommendedModel || DEFAULTS.MODEL_REFINER;
}

/**
 * Get model selection for auto-generation
 */
export function getAutoGenModels(storageResult: any): {
  summarizerModel: string;
  qualityModel: string;
  targetLanguage: string;
  fastMode: boolean;
} {
  const summarizerModel = (storageResult[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] as string) ||
                          (storageResult[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL] as string) ||
                          DEFAULTS.MODEL_SUMMARIZER;
  const qualityModel = (storageResult[STORAGE_KEYS.QUALITY_MODEL] as string) || summarizerModel;
  const targetLanguage = (storageResult[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] as string) ||
                         (storageResult[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED] as string) ||
                         DEFAULTS.TARGET_LANGUAGE_RECOMMENDED;
  const fastMode = storageResult[STORAGE_KEYS.FAST_MODE] === true;

  return { summarizerModel, qualityModel, targetLanguage, fastMode };
}

/**
 * Execute scrape for auto-generation
 */
export async function executeScrapeForAutoGen(
  videoId: string,
  scrapeCreatorsApiKey: string
): Promise<boolean> {
  console.log(`[Auto-gen] Step 1: Scraping video data for ${videoId}...`);

  const scrapeResult = await sendChromeMessage<{ status: string; hasTranscript?: boolean }>({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
    videoId,
    scrapeCreatorsApiKey,
  }).catch((error) => {
    console.error("Error scraping video:", error.message);
    return { status: "error" as const, hasTranscript: undefined };
  });

  if (scrapeResult.status !== "success") {
    console.error(`[Auto-gen] Scrape failed for ${videoId}, aborting auto-generation`);
    return false;
  }

  console.log(`[Auto-gen] Step 2: Scrape complete. Has transcript: ${scrapeResult.hasTranscript}. Starting refine + summarize in parallel...`);
  return true;
}

/**
 * Trigger caption refinement in parallel
 */
export function triggerCaptionRefinement(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  refinerModel: string,
  onError?: (videoId: string) => void
): void {
  sendChromeMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    scrapeCreatorsApiKey,
    openRouterApiKey,
    modelSelection: refinerModel,
  })
    .then((response) => {
      console.log("[Auto-gen] Subtitle refinement triggered:", response);
    })
    .catch((error) => {
      console.error("Error triggering subtitle auto-gen:", error.message);
      onError?.(videoId);
    });
}

/**
 * Trigger summary generation in parallel
 */
export function triggerSummaryGeneration(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  models: {
    summarizerModel: string;
    qualityModel: string;
    targetLanguage: string;
    fastMode: boolean;
  }
): void {
  sendChromeMessage({
    action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
    videoId,
    scrapeCreatorsApiKey,
    openRouterApiKey,
    modelSelection: models.summarizerModel,
    qualityModel: models.qualityModel,
    targetLanguage: models.targetLanguage,
    fastMode: models.fastMode,
  })
    .then((response) => {
      console.log("[Auto-gen] Summary generation triggered:", response);
    })
    .catch((error) => {
      console.error("Error triggering summary auto-gen:", error.message);
    });
}

/**
 * Determine toggle state from message
 */
export function determineToggleState(message: any): boolean {
  const hasShowSubtitles = Object.prototype.hasOwnProperty.call(message, "showSubtitles");
  const hasEnabled = Object.prototype.hasOwnProperty.call(message, "enabled");

  return hasShowSubtitles
    ? message.showSubtitles !== false
    : hasEnabled
      ? message.enabled !== false
      : true;
}

/**
 * Build storage keys for toggle subtitle check
 */
export function buildStorageKeysForToggle(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
    STORAGE_KEYS.OPENROUTER_API_KEY,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
  ];
}
