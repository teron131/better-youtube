/**
 * Content Script for Better YouTube Chrome Extension
 * Handles subtitle display, auto-generation, and communication with background script
 */

import type { FontSize } from "@/lib/constants";
import { DEFAULTS, STORAGE_KEYS, TIMING } from "@/lib/constants";
import { type SubtitleSegment } from "@/lib/storage";
import { extractVideoId } from "@/lib/url";
import {
  clearAutoGenerationTrigger,
  isExtensionContextValid,
  scheduleAutoGeneration,
  validateAutoGenerationConditions,
} from "./autoGeneration";
import {
  buildStorageKeysForVideo,
  executeScrapeForAutoGen,
  getAutoGenModels,
  getRefinerModelFromStorage,
  triggerCaptionRefinement,
  triggerSummaryGeneration,
  validateLoadContext
} from "./contentHelpers";
import { setupMessageListener } from "./messageHandler";
import {
  applyCaptionFontSize,
  clearRenderer,
  createSubtitleElements,
  findVideoElements,
  startSubtitleDisplay
} from "./subtitleRenderer";

// Global state wrapped in an object for shared reference
const state = {
  currentSubtitles: [] as SubtitleSegment[],
  showSubtitlesEnabled: true,
};

let initAttempts = 0;
let currentUrl = window.location.href;
let urlObserver: MutationObserver | null = null;

interface StorageResult {
  [key: string]: unknown;
}

/**
 * Check if auto-generation should be triggered
 */
async function checkAndTriggerAutoGeneration(
  videoId: string,
  storageResult: StorageResult,
  checkCaptionsEnabled = true,
  withDelay = false
): Promise<boolean> {
  const validation = validateAutoGenerationConditions(
    videoId,
    storageResult,
    state.showSubtitlesEnabled,
    checkCaptionsEnabled
  );

  if (!validation.isValid) {
    return false;
  }

  const triggerFn = () => {
    triggerAutoGeneration(videoId, storageResult);
  };

  scheduleAutoGeneration(videoId, triggerFn, checkCaptionsEnabled, withDelay);
  return true;
}

function loadStoredSubtitles(): void {
  if (!isExtensionContextValid()) {
    console.warn("Extension context invalidated, skipping subtitle load.");
    return;
  }

  const validation = validateLoadContext();
  if (!validation.isValid || !validation.videoId) {
    return;
  }

  const videoId = validation.videoId;
  const keysToFetch = [videoId, ...buildStorageKeysForVideo()];

  chrome.storage.local.get(keysToFetch, (result) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading subtitles from storage:", chrome.runtime.lastError.message);
      return;
    }

    state.showSubtitlesEnabled = result[STORAGE_KEYS.SHOW_SUBTITLES] !== false;

    if (result[videoId]) {
      console.log("Found stored subtitles for this video.");
      state.currentSubtitles = result[videoId] as SubtitleSegment[];
      if (state.showSubtitlesEnabled) {
        startSubtitleDisplay(state.currentSubtitles);
      }
    } else {
      console.log("No stored subtitles found for this video.");
      checkAndTriggerAutoGeneration(videoId, result, true, true);
    }
  });
}

/**
 * Trigger automatic processing: Scrape first, then refine + summarize in parallel
 */
async function triggerAutoGeneration(
  videoId: string,
  storageResult: StorageResult
): Promise<void> {
  clearSubtitles();

  const scrapeCreatorsApiKey = storageResult[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY] as string;
  const openRouterApiKey = storageResult[STORAGE_KEYS.OPENROUTER_API_KEY] as string;

  // Step 1: Scrape video data first
  const scrapeSuccess = await executeScrapeForAutoGen(videoId, scrapeCreatorsApiKey);
  if (!scrapeSuccess) {
    clearAutoGenerationTrigger(videoId);
    return;
  }

  // Step 2: Trigger refine + summarize in parallel
  const showSubtitles = storageResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
  const models = getAutoGenModels(storageResult);

  if (showSubtitles) {
    const refinerModel = getRefinerModelFromStorage(storageResult);
    triggerCaptionRefinement(videoId, scrapeCreatorsApiKey, openRouterApiKey, refinerModel, clearAutoGenerationTrigger);
  } else {
    console.log("[Auto-gen] Skipping caption refinement (showSubtitles disabled)");
  }

  triggerSummaryGeneration(videoId, scrapeCreatorsApiKey, openRouterApiKey, models);
}

/**
 * Monitor URL changes on YouTube (SPA behavior)
 */
function monitorUrlChanges(): void {
  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }

  urlObserver = new MutationObserver(() => {
    if (!isExtensionContextValid()) {
      if (urlObserver) {
        urlObserver.disconnect();
        urlObserver = null;
      }
      return;
    }

    if (currentUrl !== window.location.href) {
      console.log("URL changed (mutation).");
      const oldVideoId = extractVideoId(currentUrl);
      currentUrl = window.location.href;

      if (oldVideoId) {
        clearAutoGenerationTrigger(oldVideoId);
      }

      onUrlChange();
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Handle actions when the URL changes
 */
function onUrlChange(): void {
  console.log("Reinitializing for new video...");
  clearSubtitles();
  initAttempts = 0;
  initialize();
}

/**
 * Initialize the content script
 */
function initialize(): void {
  console.log("Initializing content script...");

  if (!window.location.href.includes("youtube.com/watch")) {
    return;
  }

  if (!findVideoElements()) {
    initAttempts++;
    if (initAttempts < TIMING.MAX_INIT_ATTEMPTS) {
      setTimeout(initialize, TIMING.INIT_RETRY_DELAY_MS);
    } else {
      console.error("Video player or container not found after multiple attempts.");
    }
    return;
  }

  createSubtitleElements();
  loadStoredSubtitles();
  loadCaptionFontSize();
  
  setupMessageListener(state, {
    clearSubtitles,
    checkAndTriggerAutoGeneration
  });
}

function loadCaptionFontSize(): void {
  if (!isExtensionContextValid()) return;

  chrome.storage.local.get([STORAGE_KEYS.CAPTION_FONT_SIZE], (result) => {
    if (chrome.runtime.lastError) return;
    const fontSize = (result?.[STORAGE_KEYS.CAPTION_FONT_SIZE] || DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
    applyCaptionFontSize(fontSize);
  });
}

/**
 * Clear subtitles and stop display
 */
function clearSubtitles(): void {
  state.currentSubtitles = [];
  clearRenderer();
  console.log("Subtitles cleared.");
}

// Initialize immediately since we're using document_end in manifest
(function () {
  console.log("Content script loaded, readyState:", document.readyState);

  const startInitialization = () => {
    initialize();
    monitorUrlChanges();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startInitialization);
  } else {
    setTimeout(startInitialization, TIMING.CONTENT_SCRIPT_INIT_DELAY_MS);
  }
})();
