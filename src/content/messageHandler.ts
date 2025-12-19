/**
 * Message Handler for Content Script
 */

import { MESSAGE_ACTIONS, STORAGE_KEYS, DEFAULTS } from "@/lib/constants";
import type { FontSize } from "@/lib/constants";
import { extractVideoId } from "@/lib/url";
import { SubtitleSegment, saveSubtitles } from "@/lib/storage";
import { 
  applyCaptionFontSize, 
  startSubtitleDisplay, 
  stopSubtitleDisplay, 
  clearRenderer 
} from "./subtitleRenderer";
import { clearAutoGenerationTrigger } from "./autoGeneration";

export function setupMessageListener(
  state: {
    currentSubtitles: SubtitleSegment[];
    showSubtitlesEnabled: boolean;
  },
  actions: {
    clearSubtitles: () => void;
    checkAndTriggerAutoGeneration: (videoId: string, storageResult: any, checkCaptionsEnabled: boolean, withDelay: boolean) => Promise<boolean>;
  }
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
        handleGetVideoTitle(sendResponse);
        break;
      case MESSAGE_ACTIONS.GENERATE_SUMMARY:
        handleGenerateSummary(message, sendResponse);
        break;
      case MESSAGE_ACTIONS.GENERATE_SUBTITLES:
        handleGenerateSubtitles(message, actions.clearSubtitles, sendResponse);
        break;
      case MESSAGE_ACTIONS.SUBTITLES_GENERATED:
        handleSubtitlesGenerated(message, state, sendResponse);
        break;
      case MESSAGE_ACTIONS.TOGGLE_SUBTITLES:
        handleToggleSubtitles(message, state, actions.checkAndTriggerAutoGeneration, sendResponse);
        break;
      case MESSAGE_ACTIONS.UPDATE_CAPTION_FONT_SIZE:
        handleUpdateCaptionFontSize(message, sendResponse);
        break;
      default:
        return false;
    }
    return true;
  });
}

function handleGetVideoTitle(sendResponse: (response: any) => void): void {
  const titleElement = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
  const title = titleElement ? titleElement.textContent : null;
  sendResponse({ title });
}

function handleGenerateSummary(
  message: any,
  sendResponse: (response: any) => void
): void {
  const videoId = message.videoId || extractVideoId(window.location.href);
  if (!videoId) {
    sendResponse({ status: "error", message: "Could not extract video ID from URL." });
    return;
  }

  chrome.runtime.sendMessage({
    action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
    videoId,
    scrapeCreatorsApiKey: message.scrapeCreatorsApiKey,
    openRouterApiKey: message.openRouterApiKey,
    modelSelection: message.modelSelection,
    targetLanguage: message.targetLanguage,
    fastMode: message.fastMode,
    qualityModel: message.qualityModel
  });

  sendResponse({ status: "started" });
}

function handleGenerateSubtitles(
  message: any,
  clearSubtitles: () => void,
  sendResponse: (response: any) => void
): void {
  const videoId = message.videoId || extractVideoId(window.location.href);
  if (!videoId) {
    sendResponse({ status: "error", message: "Could not extract video ID from URL." });
    return;
  }

  clearSubtitles();

  chrome.runtime.sendMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    scrapeCreatorsApiKey: message.scrapeCreatorsApiKey,
    openRouterApiKey: message.openRouterApiKey,
    modelSelection: message.modelSelection,
    forceRegenerate: message.forceRegenerate === true,
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error communicating with background:", chrome.runtime.lastError);
    } else if (response?.status === "error") {
      clearAutoGenerationTrigger(videoId);
    }
  });

  sendResponse({ status: "started" });
}

function handleSubtitlesGenerated(
  message: any,
  state: { currentSubtitles: SubtitleSegment[]; showSubtitlesEnabled: boolean },
  sendResponse: (response: any) => void
): void {
  state.currentSubtitles = message.subtitles || [];
  
  if (state.currentSubtitles.length > 0) {
    if (state.showSubtitlesEnabled) {
      startSubtitleDisplay(state.currentSubtitles);
    }

    const videoId = message.videoId || extractVideoId(window.location.href);
    if (videoId) {
      saveSubtitles(videoId, state.currentSubtitles).catch(console.error);
    }
    sendResponse({ status: "success" });
  } else {
    state.currentSubtitles = [];
    clearRenderer();
    sendResponse({ status: "no_subtitles_found" });
  }
}

function handleToggleSubtitles(
  message: any,
  state: { currentSubtitles: SubtitleSegment[]; showSubtitlesEnabled: boolean },
  checkAndTriggerAutoGeneration: (videoId: string, storageResult: any, checkCaptionsEnabled: boolean, withDelay: boolean) => Promise<boolean>,
  sendResponse: (response: any) => void
): void {
  const hasShowSubtitles = Object.prototype.hasOwnProperty.call(message, "showSubtitles");
  const hasEnabled = Object.prototype.hasOwnProperty.call(message, "enabled");
  
  const nextState = hasShowSubtitles
    ? message.showSubtitles !== false
    : hasEnabled
      ? message.enabled !== false
      : true;

  const wasEnabled = state.showSubtitlesEnabled;
  state.showSubtitlesEnabled = nextState;
  chrome.storage.local.set({ [STORAGE_KEYS.SHOW_SUBTITLES]: state.showSubtitlesEnabled });

  if (state.showSubtitlesEnabled && state.currentSubtitles.length > 0) {
    startSubtitleDisplay(state.currentSubtitles);
  } else {
    stopSubtitleDisplay();
    clearRenderer();
  }

  if (state.showSubtitlesEnabled && !wasEnabled && state.currentSubtitles.length === 0) {
    const videoId = extractVideoId(window.location.href);
    if (videoId) {
      chrome.storage.local.get([
        videoId,
        STORAGE_KEYS.AUTO_GENERATE,
        STORAGE_KEYS.SCRAPE_CREATORS_API_KEY,
        STORAGE_KEYS.OPENROUTER_API_KEY,
        STORAGE_KEYS.REFINER_RECOMMENDED_MODEL,
        STORAGE_KEYS.REFINER_CUSTOM_MODEL,
      ], (result) => {
        if (result[videoId] && result[videoId].length > 0) {
          state.currentSubtitles = result[videoId];
          startSubtitleDisplay(state.currentSubtitles);
        } else {
          checkAndTriggerAutoGeneration(videoId, result, false, false);
        }
      });
    }
  }

  sendResponse({ status: "success" });
}

function handleUpdateCaptionFontSize(
  message: any,
  sendResponse: (response: any) => void
): void {
  const fontSize = (message.fontSize || DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
  applyCaptionFontSize(fontSize);
  sendResponse({ status: "success" });
}
