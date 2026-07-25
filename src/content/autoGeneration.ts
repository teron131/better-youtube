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
const autoGenVisibilityWaiters = new Map<string, () => void>();
const TAB_VISIBLE_STATE = "visible";

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
  autoGenVisibilityWaiters.get(videoId)?.();
  autoGenVisibilityWaiters.delete(videoId);
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

  const hasLlmKey = !!String(storageResult[STORAGE_KEYS.LLM_API_KEY] || "").trim();
  const hasGeminiKey = !!String(storageResult[STORAGE_KEYS.GEMINI_API_KEY] || "").trim();
  if (!hasLlmKey && !hasGeminiKey) {
    console.log("Auto-gen skipped: missing summarizer API key");
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
    console.log("Auto-gen cancel: video ID changed", originalVideoId, "->", currentVideoId);
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
      const captionsStillEnabled = checkResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
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
  triggerFn: () => void | Promise<void>,
  checkCaptionsEnabled: boolean,
): Promise<void> {
  if (!isVideoIdSame(videoId)) return;

  if (checkCaptionsEnabled) {
    const captionsEnabled = await areCaptionsEnabled(videoId);
    if (!captionsEnabled) return;
    // Re-verify video ID after async operation
    if (!isVideoIdSame(videoId)) return;
  }

  try {
    await triggerFn();
  } catch (error) {
    console.error("Auto-gen execution failed:", error);
    clearAutoGenTrigger(videoId);
  }
}

function waitForVisibleTab(videoId: string, triggerFn: () => void): void {
  if (document.visibilityState === TAB_VISIBLE_STATE) {
    triggerFn();
    return;
  }

  if (autoGenVisibilityWaiters.has(videoId)) {
    return;
  }

  console.log("Auto-gen waiting for the tab to become visible:", videoId);

  const cleanup = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    autoGenVisibilityWaiters.delete(videoId);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== TAB_VISIBLE_STATE) return;

    cleanup();

    if (!isExtensionContextValid()) {
      console.log("Context invalidated before auto-generation, aborting.");
      clearAutoGenTrigger(videoId);
      return;
    }

    console.log("Auto-gen visibility restored; triggering now for", videoId);
    triggerFn();
  };

  autoGenVisibilityWaiters.set(videoId, cleanup);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function triggerWhenReady(
  videoId: string,
  triggerFn: () => void | Promise<void>,
  checkCaptionsEnabled: boolean,
): void {
  waitForVisibleTab(videoId, () => {
    void executeAutoGen(videoId, triggerFn, checkCaptionsEnabled);
  });
}

/**
 * Schedule auto-generation with optional delay
 */
export function scheduleAutoGen(
  videoId: string,
  triggerFn: () => void | Promise<void>,
  checkCaptionsEnabled: boolean,
  withDelay: boolean,
): void {
  markAutoGenTriggered(videoId);

  const triggerMode = withDelay ? "waiting for page to load..." : "triggering immediately...";
  console.log("Auto-gen enabled,", triggerMode, "videoId:", videoId);

  if (withDelay) {
    setTimeout(() => {
      if (!isExtensionContextValid()) {
        console.log("Context invalidated before auto-generation, aborting.");
        clearAutoGenTrigger(videoId);
        return;
      }
      console.log("Auto-gen delay elapsed; waiting for visible tab:", videoId);
      triggerWhenReady(videoId, triggerFn, checkCaptionsEnabled);
    }, TIMING.AUTO_GENERATION_DELAY_MS);
  } else {
    triggerWhenReady(videoId, triggerFn, checkCaptionsEnabled);
  }
}
