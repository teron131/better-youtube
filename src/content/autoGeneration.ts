/**
 * Auto-Generation Utilities
 * Handles automatic subtitle generation logic
 */

import { STORAGE_KEYS, TIMING } from "@/core/constants";
import { isChromeContextValid as isExtensionContextValid } from "@/core/utils/chrome";
import { extractVideoId } from "@/core/utils/url";
import { isCurrentVideo } from "./videoHelpers";

export { isExtensionContextValid };

// Track which videos have had auto-generation triggered
const autoGenTriggered = new Set<string>();

/**
 * Check if auto-generation has been triggered for a video
 */
export function isAutoGenTriggered(videoId: string): boolean {
  return autoGenTriggered.has(videoId);
}

/**
 * Mark auto-generation as triggered for a video
 */
export function markAutoGenTriggered(videoId: string): void {
  autoGenTriggered.add(videoId);
}

/**
 * Clear auto-generation trigger for a video
 */
export function clearAutoGenTrigger(videoId: string): void {
  autoGenTriggered.delete(videoId);
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
export function validateAutoGen(
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

  if (isAutoGenTriggered(videoId)) {
    console.log("Auto-gen skipped: already triggered for video", videoId);
    return { isValid: false, reason: "already triggered" };
  }

  return { isValid: true };
}

function isVideoIdSame(originalVideoId: string): boolean {
  if (!isCurrentVideo(originalVideoId)) {
    const currentVideoId = extractVideoId(window.location.href);
    console.log(
      "Auto-gen cancel: video ID changed",
      originalVideoId,
      "->",
      currentVideoId,
    );
    clearAutoGenTrigger(originalVideoId);
    return false;
  }
  return true;
}

/**
 * Verify captions are still enabled
 */
function areCaptionsEnabled(videoId: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.SHOW_SUBTITLES], (checkResult) => {
      const captionsStillEnabled =
        checkResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
      if (!captionsStillEnabled) {
        console.log("Auto-gen cancel: captions disabled");
        clearAutoGenTrigger(videoId);
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
async function executeAutoGen(
  videoId: string,
  triggerFn: () => void,
  checkCaptionsEnabled: boolean,
): Promise<void> {
  if (!isVideoIdSame(videoId)) {
    return;
  }

  if (checkCaptionsEnabled) {
    const captionsEnabled = await areCaptionsEnabled(videoId);
    if (!captionsEnabled) {
      return;
    }
    // Re-verify video ID after async operation
    if (!isVideoIdSame(videoId)) {
      return;
    }
  }

  triggerFn();
}

/**
 * Schedule auto-generation with optional delay
 */
export function scheduleAutoGen(
  videoId: string,
  triggerFn: () => void,
  checkCaptionsEnabled: boolean,
  withDelay: boolean,
): void {
  markAutoGenTriggered(videoId);

  console.log(
    "Auto-gen enabled,",
    withDelay ? "waiting for page to load..." : "triggering immediately...",
    "videoId:",
    videoId,
  );

  const executeTrigger = () => {
    executeAutoGen(videoId, triggerFn, checkCaptionsEnabled);
  };

  if (withDelay) {
    setTimeout(() => {
      if (!isExtensionContextValid()) {
        console.log("Context invalidated before auto-generation, aborting.");
        clearAutoGenTrigger(videoId);
        return;
      }
      console.log("Auto-gen delay elapsed; triggering now for", videoId);
      executeTrigger();
    }, TIMING.AUTO_GENERATION_DELAY_MS);
  } else {
    executeTrigger();
  }
}
