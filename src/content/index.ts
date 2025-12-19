/**
 * Content Script for Better YouTube Chrome Extension
 * Handles subtitle display, auto-generation, and communication with background script
 */

import { DEFAULTS, MESSAGE_ACTIONS, STORAGE_KEYS, TIMING } from "@/lib/constants";
import type { FontSize } from "@/lib/constants";
import { saveSubtitles, type SubtitleSegment } from "@/lib/storage";
import { extractVideoId } from "@/lib/url";
import {
  clearAutoGenerationTrigger,
  isExtensionContextValid,
  scheduleAutoGeneration,
  validateAutoGenerationConditions,
} from "./autoGeneration";
import {
  applyCaptionFontSize,
  clearRenderer,
  createSubtitleElements,
  findVideoElements,
  startSubtitleDisplay,
  stopSubtitleDisplay,
} from "./subtitleRenderer";

// Global state
let currentSubtitles: SubtitleSegment[] = [];
let initAttempts = 0;
let currentUrl = window.location.href;
let showSubtitlesEnabled = true;
let urlObserver: MutationObserver | null = null;

interface StorageResult {
  [key: string]: unknown;
}

/**
 * Get refiner model from storage
 */
async function getRefinerModelFromStorage(storageResult: StorageResult): Promise<string> {
  const customModel = storageResult[STORAGE_KEYS.REFINER_CUSTOM_MODEL] as string | undefined;
  if (customModel) return customModel;

  const recommendedModel = storageResult[STORAGE_KEYS.REFINER_RECOMMENDED_MODEL] as string | undefined;
  return recommendedModel || DEFAULTS.MODEL_REFINER;
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
    showSubtitlesEnabled,
    checkCaptionsEnabled
  );

  if (!validation.isValid) {
    return false;
  }

  const modelSelection = await getRefinerModelFromStorage(storageResult);
  const triggerFn = () => {
    triggerAutoGeneration(
      videoId,
      storageResult[STORAGE_KEYS.SCRAPE_CREATORS_API_KEY] as string,
      storageResult[STORAGE_KEYS.OPENROUTER_API_KEY] as string,
      modelSelection
    );
  };

  scheduleAutoGeneration(videoId, triggerFn, checkCaptionsEnabled, withDelay);
  return true;
}

/**
 * Load stored subtitles for the current video
 */
function loadStoredSubtitles(): void {
  try {
    if (!isExtensionContextValid()) {
      console.warn("Extension context invalidated, skipping subtitle load.");
      return;
    }

    if (!window.location.href.includes("youtube.com/watch")) {
      console.log("Not on a video page, skipping subtitle load.");
      return;
    }

    const videoId = extractVideoId(window.location.href);
    if (!videoId) {
      console.warn("Could not extract video ID, skipping subtitle load.");
      return;
    }

    const keysToFetch = [
      videoId,
      STORAGE_KEYS.AUTO_GENERATE,
      STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
      STORAGE_KEYS.OPENROUTER_API_KEY,
      STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
      STORAGE_KEYS.REFINER_CUSTOM_MODEL,
      STORAGE_KEYS.SHOW_SUBTITLES,
    ];

    chrome.storage.local.get(keysToFetch, (result) => {
      try {
        if (chrome.runtime.lastError) {
          console.error("Error loading subtitles from storage:", chrome.runtime.lastError.message);
          return;
        }

        showSubtitlesEnabled = result[STORAGE_KEYS.SHOW_SUBTITLES] !== false;

        if (result && result[videoId]) {
          console.log("Found stored subtitles for this video.");
          currentSubtitles = result[videoId] as SubtitleSegment[];
          if (showSubtitlesEnabled) {
            startSubtitleDisplay(currentSubtitles);
          }
        } else {
          console.log("No stored subtitles found for this video.");
          checkAndTriggerAutoGeneration(videoId, result, true, true);
        }
      } catch (error) {
        console.error("Error processing stored subtitles:", error);
      }
    });
  } catch (error) {
    console.error("Error in loadStoredSubtitles:", error);
  }
}

/**
 * Trigger automatic subtitle generation
 */
function triggerAutoGeneration(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  modelSelection: string
): void {
  clearSubtitles();

  console.log("Sending fetchSubtitles message to background...", {
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    hasScrapeKey: !!scrapeCreatorsApiKey,
    hasOpenRouterKey: !!openRouterApiKey,
    modelSelection,
  });

  chrome.runtime.sendMessage(
    {
      action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
      videoId,
      scrapeCreatorsApiKey,
      openRouterApiKey,
      modelSelection,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error triggering auto-generation:", chrome.runtime.lastError.message);
        clearAutoGenerationTrigger(videoId);
      } else {
        console.log("Auto-generation triggered successfully, response:", response);
      }
    }
  );
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
    console.log("Not on a video page, skipping initialization.");
    return;
  }

  if (!findVideoElements()) {
    initAttempts++;
    if (initAttempts < TIMING.MAX_INIT_ATTEMPTS) {
      console.log(
        `Video player not found, retrying (${initAttempts}/${TIMING.MAX_INIT_ATTEMPTS})...`
      );
      setTimeout(initialize, TIMING.INIT_RETRY_DELAY_MS);
    } else {
      console.error("Video player or container not found after multiple attempts.");
    }
    return;
  }

  console.log("Video player found.");

  createSubtitleElements();
  loadStoredSubtitles();
  loadCaptionFontSize();
  setupMessageListener();
}

/**
 * Setup message listener for content script
 */
function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === MESSAGE_ACTIONS.GET_VIDEO_TITLE) {
      handleGetVideoTitle(sendResponse);
      return true;
    } else if (message.action === MESSAGE_ACTIONS.GENERATE_SUMMARY) {
      handleGenerateSummary(message, sendResponse);
      return true;
    } else if (message.action === MESSAGE_ACTIONS.GENERATE_SUBTITLES) {
      handleGenerateSubtitles(message, sendResponse);
      return true;
    } else if (message.action === MESSAGE_ACTIONS.SUBTITLES_GENERATED) {
      handleSubtitlesGenerated(message, sendResponse);
      return true;
    } else if (message.action === MESSAGE_ACTIONS.TOGGLE_SUBTITLES) {
      handleToggleSubtitles(message, sendResponse);
      return true;
    } else if (message.action === MESSAGE_ACTIONS.UPDATE_CAPTION_FONT_SIZE) {
      handleUpdateCaptionFontSize(message, sendResponse);
      return true;
    }
    return false;
  });
}

/**
 * Handle get video title request
 */
function handleGetVideoTitle(sendResponse: (response: unknown) => void): void {
  const titleElement = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
  const title = titleElement ? titleElement.textContent : null;
  sendResponse({ title });
}

/**
 * Handle generate summary request
 */
function handleGenerateSummary(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void
): void {
  console.log("Received generateSummary request");

  const videoId = (message.videoId as string) || extractVideoId(window.location.href);

  if (!videoId) {
    sendResponse({
      status: "error",
      message: "Could not extract video ID from URL.",
    });
    return;
  }

  console.log("Requesting summary from background for video:", videoId);

  chrome.runtime.sendMessage(
    {
      action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
      videoId,
      scrapeCreatorsApiKey: message.scrapeCreatorsApiKey,
      openRouterApiKey: message.openRouterApiKey,
      modelSelection: message.modelSelection,
      targetLanguage: message.targetLanguage,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message to background:", chrome.runtime.lastError);
      } else {
        console.log("Summary request sent to background, response:", response);
      }
    }
  );

  sendResponse({ status: "started" });
}

/**
 * Handle generate subtitles request
 */
function handleGenerateSubtitles(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void
): void {
  console.log("Received generateSubtitles request");

  const videoId = (message.videoId as string) || extractVideoId(window.location.href);

  if (!videoId) {
    sendResponse({
      status: "error",
      message: "Could not extract video ID from URL.",
    });
    return;
  }

  console.log("Sending video ID to background:", videoId);
  clearSubtitles();

  chrome.runtime.sendMessage(
    {
      action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
      videoId,
      scrapeCreatorsApiKey: message.scrapeCreatorsApiKey,
      openRouterApiKey: message.openRouterApiKey,
      modelSelection: message.modelSelection,
      forceRegenerate: message.forceRegenerate === true,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message to background:", chrome.runtime.lastError);
        sendResponse({
          status: "error",
          message: "Could not communicate with background script.",
        });
      } else {
        console.log("Message sent to background, response:", response);
        if (response?.status === "error") {
          clearAutoGenerationTrigger(videoId);
        }
      }
    }
  );

  sendResponse({ status: "started" });
}

/**
 * Handle subtitles generated message
 */
function handleSubtitlesGenerated(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void
): void {
  console.log("Received subtitlesGenerated request");
  currentSubtitles = (message.subtitles as SubtitleSegment[]) || [];
  console.log(`Received ${currentSubtitles.length} subtitle entries.`);

  if (currentSubtitles.length > 0) {
    if (showSubtitlesEnabled) {
      startSubtitleDisplay(currentSubtitles);
    }

    const videoId = (message.videoId as string) || extractVideoId(window.location.href);

    if (videoId) {
      saveSubtitles(videoId, currentSubtitles).catch((error) => {
        console.error("Error saving subtitles:", error);
      });
    } else {
      console.warn("Could not extract video ID, subtitles not saved.");
    }

    sendResponse({ status: "success" });
  } else {
    console.warn("Received empty subtitles array.");
    clearSubtitles();
    sendResponse({ status: "no_subtitles_found" });
  }
}

/**
 * Load and apply caption font size from storage
 */
function loadCaptionFontSize(): void {
  try {
    if (!isExtensionContextValid()) {
      console.log("Context invalidated, skipping font size load.");
      return;
    }

    chrome.storage.local.get([STORAGE_KEYS.CAPTION_FONT_SIZE], (result) => {
      try {
        if (chrome.runtime.lastError) {
          console.warn("Error loading caption font size:", chrome.runtime.lastError.message);
          return;
        }

        const fontSize = (result?.[STORAGE_KEYS.CAPTION_FONT_SIZE] ||
          DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
        applyCaptionFontSize(fontSize);
      } catch (error) {
        console.error("Error applying caption font size:", error);
      }
    });
  } catch (error) {
    console.error("Error in loadCaptionFontSize:", error);
  }
}

/**
 * Handle update caption font size message
 */
function handleUpdateCaptionFontSize(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void
): void {
  const fontSize = (message.fontSize || DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
  applyCaptionFontSize(fontSize);
  sendResponse({ status: "success" });
}

/**
 * Handle toggle subtitles message
 */
function handleToggleSubtitles(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void
): void {
  console.log("Received toggleSubtitles request");
  const hasShowSubtitles = Object.prototype.hasOwnProperty.call(message, "showSubtitles");
  const hasEnabled = Object.prototype.hasOwnProperty.call(message, "enabled");
  const nextState = hasShowSubtitles
    ? message.showSubtitles !== false
    : hasEnabled
      ? message.enabled !== false
      : true;
  const wasEnabled = showSubtitlesEnabled;
  showSubtitlesEnabled = nextState;
  chrome.storage.local.set({ [STORAGE_KEYS.SHOW_SUBTITLES]: showSubtitlesEnabled });

  if (showSubtitlesEnabled && currentSubtitles.length > 0) {
    startSubtitleDisplay(currentSubtitles);
  } else {
    stopSubtitleDisplay();
    clearRenderer();
  }

  // If captions were just turned on and there are no subtitles, check for auto-generation
  if (showSubtitlesEnabled && !wasEnabled && currentSubtitles.length === 0) {
    const videoId = extractVideoId(window.location.href);
    if (videoId) {
      chrome.storage.local.get(
        [
          videoId,
          STORAGE_KEYS.AUTO_GENERATE,
          STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
          STORAGE_KEYS.OPENROUTER_API_KEY,
          STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
          STORAGE_KEYS.REFINER_CUSTOM_MODEL,
        ],
        (result) => {
          if (result[videoId] && (result[videoId] as SubtitleSegment[]).length > 0) {
            console.log("Subtitles already exist for this video, loading them...");
            currentSubtitles = result[videoId] as SubtitleSegment[];
            startSubtitleDisplay(currentSubtitles);
            return;
          }

          checkAndTriggerAutoGeneration(videoId, result, false, false);
        }
      );
    }
  }

  sendResponse({ status: "success" });
}

/**
 * Clear subtitles and stop display
 */
function clearSubtitles(): void {
  currentSubtitles = [];
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
