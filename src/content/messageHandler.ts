/**
 * Message Handler for Content Script
 */

import { convertSubtitlesToTraditionalChinese } from "@/lib/utils/text";
import { sendChromeMessage } from "@/lib/utils/chrome";
import type { FontSize } from "@/lib/core/constants";
import {
  DEFAULTS,
  MESSAGE_ACTIONS,
  STORAGE_KEYS,
  YOUTUBE,
} from "@/lib/core/constants";
import { createRequestId, type RequestId } from "@/lib/requestId";
import { saveSubtitles, type SubtitleSegment } from "@/lib/core/storage";
import { extractVideoId } from "@/lib/utils/url";
import {
  clearAutoGenerationTrigger,
  markAutoGenerationTriggered,
} from "./autoGeneration";
import {
  ContentScriptState,
  buildStorageKeysForToggle,
  determineToggleState,
  isCurrentVideo,
} from "./contentHelpers";
import {
  applyCaptionFontSize,
  clearRenderer,
  startSubtitleDisplay,
  stopSubtitleDisplay,
} from "./subtitleRenderer";

export function setupMessageListener(
  state: ContentScriptState,
  actions: {
    clearSubtitles: () => void;
    checkAndTriggerAutoGeneration: (
      videoId: string,
      storageResult: any,
      checkCaptionsEnabled: boolean,
      withDelay: boolean,
    ) => Promise<boolean>;
  },
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
        handleGenerateSubtitles(
          message,
          state,
          actions.clearSubtitles,
          sendResponse,
        );
        break;
      case MESSAGE_ACTIONS.SUBTITLES_GENERATED:
        handleSubtitlesGenerated(message, state, sendResponse);
        break;
      case MESSAGE_ACTIONS.TOGGLE_SUBTITLES:
        handleToggleSubtitles(
          message,
          state,
          actions.checkAndTriggerAutoGeneration,
          sendResponse,
        );
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
  const titleElement = document.querySelector(YOUTUBE.SELECTORS.VIDEO_TITLE);
  sendResponse({ title: titleElement?.textContent ?? null });
}

function handleGenerateSummary(
  message: any,
  sendResponse: (response: any) => void,
): void {
  const videoId = message.videoId || extractVideoId(window.location.href);
  if (!videoId) {
    sendResponse({
      status: "error",
      message: "Could not extract video ID from URL.",
    });
    return;
  }

  const requestId: RequestId | undefined = message.requestId as
    | RequestId
    | undefined;

  sendChromeMessage({
    action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
    videoId,
    requestId,
    modelSelection: message.modelSelection,
    targetLanguage: message.targetLanguage,
    fastMode: message.fastMode,
    qualityModel: message.qualityModel,
  }).catch((error) => {
    console.error("Error sending generate summary message:", error.message);
  });

  sendResponse({ status: "started" });
}

function handleGenerateSubtitles(
  message: any,
  state: ContentScriptState,
  clearSubtitles: () => void,
  sendResponse: (response: any) => void,
): void {
  const videoId = message.videoId || extractVideoId(window.location.href);
  if (!videoId) {
    sendResponse({
      status: "error",
      message: "Could not extract video ID from URL.",
    });
    return;
  }

  clearSubtitles();
  markAutoGenerationTriggered(videoId);

  const requestId: RequestId =
    (message.requestId as RequestId | undefined) ?? createRequestId("caption");
  state.currentCaptionRequestId = requestId;

  sendChromeMessage<{ status: string }>({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    requestId,
    modelSelection: message.modelSelection,
    forceRegenerate: message.forceRegenerate === true,
  })
    .then((response) => {
      if (response?.status === "error") {
        clearAutoGenerationTrigger(videoId);
      }
    })
    .catch((error) => {
      console.error("Error communicating with background:", error.message);
    });

  sendResponse({ status: "started" });
}

function handleSubtitlesGenerated(
  message: any,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): void {
  const subtitles = message.subtitles || [];
  const messageVideoId = message.videoId;
  const messageRequestId = message.requestId as RequestId | undefined;

  // Stale guard: ignore any caption results not matching the latest request for this video.
  if (
    messageVideoId &&
    state.currentCaptionRequestId &&
    messageRequestId &&
    messageRequestId !== state.currentCaptionRequestId
  ) {
    console.log(
      `Ignoring stale subtitles for video ${messageVideoId}: requestId ${messageRequestId} (expected ${state.currentCaptionRequestId})`,
    );
    sendResponse({ status: "stale_ignored" });
    return;
  }

  if (subtitles.length === 0) {
    state.currentSubtitles = [];
    clearRenderer();
    sendResponse({ status: "no_subtitles_found" });
    return;
  }

  const convertedSubtitles = convertSubtitlesToTraditionalChinese(subtitles);
  handleConvertedSubtitles(
    convertedSubtitles,
    messageVideoId,
    messageRequestId,
    state,
    sendResponse,
  );
}

function handleConvertedSubtitles(
  convertedSubtitles: SubtitleSegment[],
  messageVideoId: string | undefined,
  messageRequestId: RequestId | undefined,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): void {
  // Save converted subtitles only for the latest request for this video.
  if (
    messageVideoId &&
    convertedSubtitles.length > 0 &&
    (!messageRequestId ||
      !state.currentCaptionRequestId ||
      messageRequestId === state.currentCaptionRequestId)
  ) {
    // Note: background only sends to the tab that initiated the request, but YouTube is SPA,
    // so we still defensively gate to avoid stale writes.
    saveSubtitles(messageVideoId, convertedSubtitles).catch(console.error);
  }

  // Only display if the subtitles are for the CURRENT video
  if (messageVideoId && !isCurrentVideo(messageVideoId)) {
    console.log(
      `Received subtitles for video ${messageVideoId}, but currently on another video. Not displaying.`,
    );
    sendResponse({ status: "saved_but_not_displayed" });
    return;
  }

  state.currentSubtitles = convertedSubtitles;

  if (state.currentSubtitles.length > 0) {
    startDisplayIfReady(state, messageVideoId);

    // Fallback save using current URL ID if message ID was missing
    if (!messageVideoId) {
      const currentVideoId = extractVideoId(window.location.href);
      if (currentVideoId) {
        saveSubtitles(currentVideoId, convertedSubtitles).catch(console.error);
      }
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
  state: ContentScriptState,
  checkAndTriggerAutoGeneration: (
    videoId: string,
    storageResult: any,
    checkCaptionsEnabled: boolean,
    withDelay: boolean,
  ) => Promise<boolean>,
  sendResponse: (response: any) => void,
): void {
  const nextState = determineToggleState(message);
  const wasEnabled = state.showSubtitlesEnabled;
  state.showSubtitlesEnabled = nextState;
  state.userInteractedWithToggle = true;
  chrome.storage.local.set({
    [STORAGE_KEYS.SHOW_SUBTITLES]: state.showSubtitlesEnabled,
  });

  // Update subtitle display based on new state
  if (state.showSubtitlesEnabled && state.currentSubtitles.length > 0) {
    startDisplayIfReady(state);
  } else {
    stopSubtitleDisplay();
    clearRenderer();
  }

  // If enabling subtitles when previously disabled and no cached subtitles, trigger auto-gen
  if (
    state.showSubtitlesEnabled &&
    !wasEnabled &&
    state.currentSubtitles.length === 0
  ) {
    triggerSubtitleAutoGenOnToggle(state, checkAndTriggerAutoGeneration);
  }

  sendResponse({ status: "success" });
}

/**
 * Trigger subtitle auto-generation when toggle is enabled without cached subtitles
 */
function triggerSubtitleAutoGenOnToggle(
  state: ContentScriptState,
  checkAndTriggerAutoGeneration: (
    videoId: string,
    storageResult: any,
    checkCaptionsEnabled: boolean,
    withDelay: boolean,
  ) => Promise<boolean>,
): void {
  const videoId = extractVideoId(window.location.href);
  if (!videoId) return;

  const keysToFetch = [videoId, ...buildStorageKeysForToggle()];
  chrome.storage.local.get(keysToFetch, (result) => {
    // Verify we are still on the same video
    if (!isCurrentVideo(videoId)) {
      return;
    }

    if (result[videoId] && result[videoId].length > 0) {
      state.currentSubtitles = result[videoId];
      startDisplayIfReady(state, videoId);
    } else {
      checkAndTriggerAutoGeneration(videoId, result, false, false);
    }
  });
}

function handleUpdateCaptionFontSize(
  message: any,
  sendResponse: (response: any) => void,
): void {
  applyCaptionFontSize(
    (message.fontSize || DEFAULTS.CAPTION_FONT_SIZE) as FontSize,
  );
  sendResponse({ status: "success" });
}

function startDisplayIfReady(
  state: ContentScriptState,
  videoId?: string | null,
): void {
  if (!state.showSubtitlesEnabled || state.currentSubtitles.length === 0) {
    return;
  }

  const resolvedVideoId = videoId || extractVideoId(window.location.href);
  if (!resolvedVideoId) return;

  startSubtitleDisplay(state.currentSubtitles, resolvedVideoId);
}
