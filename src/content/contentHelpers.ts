/** Content Script Helper Functions */

import { sendChromeMessage } from "@/lib/chromeUtils";
import { DEFAULTS, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/lib/constants";
import { extractVideoId } from "@/lib/url";

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

export function getRefinerModelFromStorage(storageResult: any): string {
  return storageResult[STORAGE_KEYS.REFINER_CUSTOM_MODEL] ||
    storageResult[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL] ||
    DEFAULTS.MODEL_REFINER;
}

export function getAutoGenModels(storageResult: any): {
  summarizerModel: string;
  qualityModel: string;
  targetLanguage: string;
  fastMode: boolean;
} {
  const summarizerModel = storageResult[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
    storageResult[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL] ||
    DEFAULTS.MODEL_SUMMARIZER;
  return {
    summarizerModel,
    qualityModel: storageResult[STORAGE_KEYS.QUALITY_MODEL] || summarizerModel,
    targetLanguage: storageResult[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
      storageResult[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED] ||
      DEFAULTS.TARGET_LANGUAGE_RECOMMENDED,
    fastMode: storageResult[STORAGE_KEYS.FAST_MODE] === true,
  };
}

export async function executeScrapeForAutoGen(
  videoId: string,
  scrapeCreatorsApiKey: string
): Promise<boolean> {
  console.log(`[Auto-gen] Step 1: Scraping video data for ${videoId}...`);
  const result = await sendChromeMessage<{ status: string }>({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
    videoId,
    scrapeCreatorsApiKey,
  }).catch(() => ({ status: "error" }));
  if (result.status !== "success") {
    console.error(`[Auto-gen] Scrape failed for ${videoId}`);
    return false;
  }
  console.log(`[Auto-gen] Step 2: Scrape complete. Starting refine + summarize...`);
  return true;
}

export function triggerCaptionRefinement(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  refinerModel: string,
  onError?: (id: string) => void
): void {
  sendChromeMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    scrapeCreatorsApiKey,
    openRouterApiKey,
    modelSelection: refinerModel,
  })
    .then((r) => console.log("[Auto-gen] Subtitle refinement triggered:", r))
    .catch((e) => {
      console.error("Error triggering subtitle auto-gen:", e.message);
      onError?.(videoId);
    });
}

export function triggerSummaryGeneration(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  m: {
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
    modelSelection: m.summarizerModel,
    qualityModel: m.qualityModel,
    targetLanguage: m.targetLanguage,
    fastMode: m.fastMode,
  })
    .then((r) => console.log("[Auto-gen] Summary generation triggered:", r))
    .catch((e) =>
      console.error("Error triggering summary auto-gen:", e.message)
    );
}

export function determineToggleState(message: any): boolean {
  if ("showSubtitles" in message) {
    return message.showSubtitles !== false;
  }
  if ("enabled" in message) {
    return message.enabled !== false;
  }
  return true;
}

export function buildStorageKeysForToggle(): string[] {
  return [
    STORAGE_KEYS.AUTO_GENERATE,
    STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
    STORAGE_KEYS.OPENROUTER_API_KEY,
    STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
    STORAGE_KEYS.REFINER_CUSTOM_MODEL,
  ];
}
