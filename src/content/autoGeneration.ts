/**
 * Auto-Generation Utilities
 * Handles automatic subtitle generation logic
 */

import { STORAGE_KEYS, TIMING } from "@/lib/core/constants";
import { extractVideoId } from "@/lib/utils/url";
import { isChromeContextValid as isExtensionContextValid } from "@/lib/utils/chrome";
import { isCurrentVideo } from "./contentHelpers";

export { isExtensionContextValid };

// Track which videos have had auto-generation triggered
const autoGenerationTriggered = new Set<string>();

/**
 * Check if auto-generation has been triggered for a video
 */
export function isAutoGenerationTriggered(videoId: string): boolean {
  return autoGenerationTriggered.has(videoId);
}

/**
 * Mark auto-generation as triggered for a video
 */
export function markAutoGenerationTriggered(videoId: string): void {
  autoGenerationTriggered.add(videoId);
}

/**
 * Clear auto-generation trigger for a video
 */
export function clearAutoGenerationTrigger(videoId: string): void {
  autoGenerationTriggered.delete(videoId);
}

interface StorageResult {
  [key: string]: unknown;
}

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Check if auto-generation conditions are met
 */
export function validateAutoGenerationConditions(
  videoId: string,
  storageResult: StorageResult,
  showSubtitlesEnabled: boolean,
  checkCaptionsEnabled: boolean,
): ValidationResult {
  if (storageResult[STORAGE_KEYS.AUTO_GENERATE] !== true) {
    console.log("Auto-gen skipped: setting disabled");
    return { isValid: false, reason: "setting disabled" };
  }

  if (checkCaptionsEnabled && !showSubtitlesEnabled) {
    console.log("Auto-gen skipped: captions disabled");
    return { isValid: false, reason: "captions disabled" };
  }

  const hasTranscriptKey =
    !!String(
      storageResult[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY] || "",
    ).trim() ||
    !!String(storageResult[STORAGE_KEYS.SUPADATA_API_KEY] || "").trim();
  if (!hasTranscriptKey) {
    console.log("Auto-gen skipped: missing transcript API key");
    return { isValid: false, reason: "missing api key" };
  }

  const hasOpenRouterKey = !!String(
    storageResult[STORAGE_KEYS.OPENROUTER_API_KEY] || "",
  ).trim();
  if (!hasOpenRouterKey) {
    console.log("Auto-gen skipped: missing OpenRouter key");
    return { isValid: false, reason: "missing api key" };
  }

  if (isAutoGenerationTriggered(videoId)) {
    console.log("Auto-gen skipped: already triggered for video", videoId);
    return { isValid: false, reason: "already triggered" };
  }

  return { isValid: true };
}

function verifyVideoIdUnchanged(originalVideoId: string): boolean {
  if (!isCurrentVideo(originalVideoId)) {
    const currentVideoId = extractVideoId(window.location.href);
    console.log(
      "Auto-gen cancel: video ID changed",
      originalVideoId,
      "->",
      currentVideoId,
    );
    clearAutoGenerationTrigger(originalVideoId);
    return false;
  }
  return true;
}

/**
 * Verify captions are still enabled
 */
function verifyCaptionsStillEnabled(videoId: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.SHOW_SUBTITLES], (checkResult) => {
      const captionsStillEnabled =
        checkResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
      if (!captionsStillEnabled) {
        console.log("Auto-gen cancel: captions disabled");
        clearAutoGenerationTrigger(videoId);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Execute auto-generation trigger with validation
 */
async function executeAutoGenerationTrigger(
  videoId: string,
  triggerFn: () => void,
  checkCaptionsEnabled: boolean,
): Promise<void> {
  if (!verifyVideoIdUnchanged(videoId)) {
    return;
  }

  if (checkCaptionsEnabled) {
    const captionsEnabled = await verifyCaptionsStillEnabled(videoId);
    if (!captionsEnabled) {
      return;
    }
    // Re-verify video ID after async operation
    if (!verifyVideoIdUnchanged(videoId)) {
      return;
    }
  }

  triggerFn();
}

/**
 * Schedule auto-generation with optional delay
 */
export function scheduleAutoGeneration(
  videoId: string,
  triggerFn: () => void,
  checkCaptionsEnabled: boolean,
  withDelay: boolean,
): void {
  markAutoGenerationTriggered(videoId);

  console.log(
    "Auto-gen enabled,",
    withDelay ? "waiting for page to load..." : "triggering immediately...",
    "videoId:",
    videoId,
  );

  const executeTrigger = () => {
    executeAutoGenerationTrigger(videoId, triggerFn, checkCaptionsEnabled);
  };

  if (withDelay) {
    setTimeout(() => {
      if (!isExtensionContextValid()) {
        console.log("Context invalidated before auto-generation, aborting.");
        clearAutoGenerationTrigger(videoId);
        return;
      }
      console.log("Auto-gen delay elapsed; triggering now for", videoId);
      executeTrigger();
    }, TIMING.AUTO_GENERATION_DELAY_MS);
  } else {
    executeTrigger();
  }
}
