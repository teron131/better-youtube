/**
 * Routes content-script messages into subtitle generation, rendering, and persisted toggle behavior.
 */

import { MESSAGE_ACTIONS, STORAGE_KEYS, YOUTUBE } from "@/core/constants";
import { normalizeFontScale } from "@/core/fontSize";
import type { RequestId } from "@/core/requestId";
import { setStorageValue, type SubtitleSegment } from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

import { AUTO_GENERATION_STORAGE_KEYS, clearAutoGenTrigger } from "./autoGeneration";
import type { ContentScriptState } from "./contentHelpers";
import {
  applyCaptionFontSize,
  clearRenderer,
  startSubtitleDisplay,
  stopSubtitleDisplay,
} from "./subtitleRenderer";
import { isCurrentVideo } from "./videoHelpers";

export function setupMessageListener(
  state: ContentScriptState,
  checkAndTriggerAutoGeneration: (
    videoId: string,
    storageResult: any,
    checkCaptionsEnabled: boolean,
    withDelay: boolean,
  ) => Promise<boolean>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
        handleGetVideoTitle(sendResponse);
        break;
      case MESSAGE_ACTIONS.SUBTITLES_GENERATED:
        handleSubtitlesGenerated(message, state, sendResponse);
        break;
      case MESSAGE_ACTIONS.TOGGLE_SUBTITLES:
        handleToggleSubtitles(message, state, checkAndTriggerAutoGeneration, sendResponse);
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

function getActiveVideoId(state: ContentScriptState): string | null {
  return state.currentVideoId || extractVideoId(window.location.href);
}

function handleSubtitlesGenerated(
  message: any,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): void {
  const subtitles = message.subtitles || [];
  const messageVideoId = message.videoId;
  const messageRequestId = message.requestId as RequestId | undefined;
  const isPartial = message.isPartial === true;
  const activeVideoId = getActiveVideoId(state);

  if (messageVideoId && activeVideoId && messageVideoId !== activeVideoId) {
    console.log(
      `Ignoring subtitles for stale video ${messageVideoId}; current video is ${activeVideoId}.`,
    );
    sendResponse({ status: "stale_video_ignored" });
    return;
  }

  // A raw-fallback message opens a caption run and names its request ID; later results from any other request are stale.
  if (message.isRawFallback === true && messageRequestId) {
    state.currentCaptionRequestId = messageRequestId;
  }
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
    if (messageVideoId) {
      clearAutoGenTrigger(messageVideoId);
    }
    sendResponse({ status: "no_subtitles_found" });
    return;
  }

  displaySubtitles(subtitles, messageVideoId, isPartial, state, sendResponse);
}

/** Display only: the background has already saved these captions together with their track before sending them. */
function displaySubtitles(
  subtitles: SubtitleSegment[],
  messageVideoId: string | undefined,
  isPartial: boolean,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): void {
  if (messageVideoId && !isCurrentVideo(messageVideoId)) {
    console.log(
      `Received subtitles for video ${messageVideoId}, but currently on another video. Not displaying.`,
    );
    sendResponse({ status: "saved_but_not_displayed" });
    return;
  }

  state.currentSubtitles = isPartial
    ? mergeSubtitleSegments(state.currentSubtitles, subtitles)
    : subtitles;
  if (state.currentSubtitles.length === 0) {
    state.currentSubtitles = [];
    clearRenderer();
    sendResponse({ status: "no_subtitles_found" });
    return;
  }

  startDisplayIfReady(state, messageVideoId);

  sendResponse({ status: "success" });
}

function mergeSubtitleSegments(
  existingSubtitles: SubtitleSegment[],
  updatedSubtitles: SubtitleSegment[],
): SubtitleSegment[] {
  if (!existingSubtitles.length) {
    return updatedSubtitles;
  }

  if (!updatedSubtitles.length) {
    return existingSubtitles;
  }

  // Refinement preserves start times, but alignment may clamp end times to remove overlaps.
  const updatedByStartTime = new Map(
    updatedSubtitles.map((subtitle) => [subtitle.startTime, subtitle]),
  );

  return existingSubtitles.map((subtitle) => {
    const updated = updatedByStartTime.get(subtitle.startTime);
    return updated ?? subtitle;
  });
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
  const nextState = message.showSubtitles !== false;
  const wasEnabled = state.showSubtitlesEnabled;
  state.showSubtitlesEnabled = nextState;
  state.userInteractedWithToggle = true;
  void setStorageValue(STORAGE_KEYS.SHOW_SUBTITLES, state.showSubtitlesEnabled).catch((error) => {
    console.error("Failed to persist subtitle toggle:", error);
  });

  if (state.showSubtitlesEnabled && state.currentSubtitles.length > 0) {
    startDisplayIfReady(state);
  } else {
    stopSubtitleDisplay();
    clearRenderer();
  }

  if (state.showSubtitlesEnabled && !wasEnabled && state.currentSubtitles.length === 0) {
    triggerAutoGenOnToggle(state, checkAndTriggerAutoGeneration);
  }

  sendResponse({ status: "success" });
}

function triggerAutoGenOnToggle(
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

  const keysToFetch = [videoId, ...AUTO_GENERATION_STORAGE_KEYS];
  chrome.storage.local.get(keysToFetch, (result) => {
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

function handleUpdateCaptionFontSize(message: any, sendResponse: (response: any) => void): void {
  applyCaptionFontSize(normalizeFontScale(message.fontSize));
  sendResponse({ status: "success" });
}

function startDisplayIfReady(state: ContentScriptState, videoId?: string | null): void {
  if (!state.showSubtitlesEnabled || state.currentSubtitles.length === 0) {
    return;
  }

  const resolvedVideoId = videoId || extractVideoId(window.location.href);
  state.currentVideoId = resolvedVideoId || undefined;
  if (!resolvedVideoId) return;

  startSubtitleDisplay(state.currentSubtitles, resolvedVideoId);
}
