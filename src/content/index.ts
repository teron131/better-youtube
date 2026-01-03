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
  ContentScriptState,
  buildStorageKeysForVideo,
  executeScrapeForAutoGen,
  getRefinerModelFromStorage,
  isCurrentVideo,
  triggerCaptionRefinement,
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

// Global state
const state: ContentScriptState = {
  currentSubtitles: [],
  showSubtitlesEnabled: true,
  userInteractedWithToggle: false,
};

let currentUrl = window.location.href;
let urlObserver: MutationObserver | null = null;

/**
 * Check if auto-generation should be triggered
 */
async function checkAndTriggerAutoGeneration(
  videoId: string,
  storageResult: Record<string, unknown>,
  checkCaptionsEnabled = true,
  withDelay = false
): Promise<boolean> {
  const validation = validateAutoGenerationConditions(
    videoId,
    storageResult,
    state.showSubtitlesEnabled,
    checkCaptionsEnabled
  );

  if (!validation.isValid) return false;

  scheduleAutoGeneration(videoId, () => triggerAutoGeneration(videoId, storageResult), checkCaptionsEnabled, withDelay);
  return true;
}

/**
 * Load subtitles from storage and initialize display
 */
function loadStoredSubtitles(): void {
  if (!isExtensionContextValid()) return;

  const validation = validateLoadContext();
  if (!validation.isValid || !validation.videoId) return;

  const videoId = validation.videoId;
  const keysToFetch = [videoId, ...buildStorageKeysForVideo()];

  chrome.storage.local.get(keysToFetch, (result) => {
    if (chrome.runtime.lastError || !isCurrentVideo(videoId)) return;

    if (!state.userInteractedWithToggle) {
      state.showSubtitlesEnabled = result[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
    }

    if (result[videoId]) {
      console.log("Found stored subtitles.");
      state.currentSubtitles = result[videoId] as SubtitleSegment[];
      if (state.showSubtitlesEnabled) startSubtitleDisplay(state.currentSubtitles);
    } else {
      checkAndTriggerAutoGeneration(videoId, result, true, true);
    }
  });
}

/**
 * Trigger automatic processing: Scrape first, then refine
 */
async function triggerAutoGeneration(
  videoId: string,
  storageResult: Record<string, unknown>
): Promise<void> {
  clearSubtitles();

  const scrapeCreatorsApiKey = storageResult[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY] as string;
  const openRouterApiKey = storageResult[STORAGE_KEYS.OPENROUTER_API_KEY] as string;

  if (await executeScrapeForAutoGen(videoId, scrapeCreatorsApiKey)) {
    if (storageResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false) {
      const refinerModel = getRefinerModelFromStorage(storageResult);
      triggerCaptionRefinement(videoId, scrapeCreatorsApiKey, openRouterApiKey, refinerModel, clearAutoGenerationTrigger);
    }
  } else {
    clearAutoGenerationTrigger(videoId);
  }
}

/**
 * Monitor URL changes on YouTube
 */
function monitorUrlChanges(): void {
  urlObserver?.disconnect();
  urlObserver = new MutationObserver(() => {
    if (!isExtensionContextValid()) {
      urlObserver?.disconnect();
      return;
    }

    if (currentUrl !== window.location.href) {
      const oldVideoId = extractVideoId(currentUrl);
      currentUrl = window.location.href;
      if (oldVideoId) clearAutoGenerationTrigger(oldVideoId);
      onUrlChange();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
}

function onUrlChange(): void {
  clearSubtitles();
  state.userInteractedWithToggle = false;
  initialize();
}

/**
 * Initialize the content script
 */
function initialize(attempts = 0): void {
  if (!window.location.href.includes("youtube.com/watch")) return;

  if (!findVideoElements()) {
    if (attempts < TIMING.MAX_INIT_ATTEMPTS) {
      setTimeout(() => initialize(attempts + 1), TIMING.INIT_RETRY_DELAY_MS);
    }
    return;
  }

  createSubtitleElements();
  loadStoredSubtitles();
  loadCaptionFontSize();
}

function loadCaptionFontSize(): void {
  if (!isExtensionContextValid()) return;
  chrome.storage.local.get([STORAGE_KEYS.CAPTION_FONT_SIZE], (result) => {
    if (chrome.runtime.lastError) return;
    const fontSize = (result?.[STORAGE_KEYS.CAPTION_FONT_SIZE] || DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
    applyCaptionFontSize(fontSize);
  });
}

function clearSubtitles(): void {
  state.currentSubtitles = [];
  clearRenderer();
}

// Start re-initialization
(function start() {
  const run = () => {
    initialize();
    monitorUrlChanges();
  };

  // Setup message listener exactly once
  setupMessageListener(state, { clearSubtitles, checkAndTriggerAutoGeneration });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    setTimeout(run, TIMING.CONTENT_SCRIPT_INIT_DELAY_MS);
  }
})();
