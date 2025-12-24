/**
 * Subtitle Renderer Module
 * Handles creation, display, and updates of subtitle elements on the YouTube video player.
 */

import type { FontSize } from "@/lib/constants";
import { ELEMENT_IDS, FONT_SIZES, TIMING, YOUTUBE } from "@/lib/constants";
import type { SubtitleSegment } from "@/lib/storage";

let subtitleContainer: HTMLDivElement | null = null;
let subtitleText: HTMLDivElement | null = null;
let videoPlayer: HTMLVideoElement | null = null;
let videoContainer: HTMLElement | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;

interface VideoPlayerWithCallback extends HTMLVideoElement {
  _subtitleUpdateFn?: () => void;
}

/**
 * Find video elements on the YouTube page
 */
export function findVideoElements(): boolean {
  videoPlayer = document.querySelector(YOUTUBE.SELECTORS.VIDEO_PLAYER);
  if (!videoPlayer) return false;

  videoContainer =
    document.querySelector(YOUTUBE.SELECTORS.MOVIE_PLAYER) ||
    document.querySelector(YOUTUBE.SELECTORS.VIDEO_CONTAINER) ||
    videoPlayer.parentElement;

  return !!videoContainer;
}

/**
 * Create subtitle elements and append them to the video container
 */
export function createSubtitleElements(): void {
  if (document.getElementById(ELEMENT_IDS.SUBTITLE_CONTAINER)) {
    subtitleContainer = document.getElementById(
      ELEMENT_IDS.SUBTITLE_CONTAINER
    ) as HTMLDivElement;
    subtitleText = document.getElementById(ELEMENT_IDS.SUBTITLE_TEXT) as HTMLDivElement;
    return;
  }

  subtitleContainer = document.createElement("div");
  subtitleContainer.id = ELEMENT_IDS.SUBTITLE_CONTAINER;
  subtitleContainer.style.position = "absolute";
  subtitleContainer.style.zIndex = "9999";
  subtitleContainer.style.pointerEvents = "none";
  subtitleContainer.style.display = "none";

  subtitleText = document.createElement("div");
  subtitleText.id = ELEMENT_IDS.SUBTITLE_TEXT;
  subtitleContainer.appendChild(subtitleText);

  if (videoContainer) {
    if (getComputedStyle(videoContainer).position === "static") {
      videoContainer.style.position = "relative";
    }
    videoContainer.appendChild(subtitleContainer);
    console.log("Subtitle container added to video container.");
  } else {
    console.error("Cannot add subtitle container, video container not found.");
  }
}

/**
 * Apply caption font size
 */
export function applyCaptionFontSize(size: FontSize): void {
  const sizeConfig = FONT_SIZES.CAPTION[size] || FONT_SIZES.CAPTION.M;

  document.documentElement.style.setProperty("--caption-font-size-base", sizeConfig.base);
  document.documentElement.style.setProperty("--caption-font-size-max", sizeConfig.max);
  document.documentElement.style.setProperty("--caption-font-size-min", sizeConfig.min);
  document.documentElement.style.setProperty(
    "--caption-font-size-fullscreen",
    sizeConfig.fullscreen
  );
  document.documentElement.style.setProperty(
    "--caption-font-size-fullscreen-max",
    sizeConfig.fullscreenMax
  );

  if (subtitleText) {
    subtitleText.style.fontSize = `clamp(${sizeConfig.min}, ${sizeConfig.base}, ${sizeConfig.max})`;
  }
}

/**
 * Find the subtitle for the current time using binary search
 */
function findSubtitleAtTime(subtitles: SubtitleSegment[], timeMs: number): SubtitleSegment | null {
  let low = 0;
  let high = subtitles.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const subtitle = subtitles[mid];

    if (timeMs >= subtitle.startTime && timeMs < subtitle.endTime) {
      return subtitle;
    } else if (timeMs < subtitle.startTime) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return null;
}

function updateSubtitlesInternal(currentSubtitles: SubtitleSegment[]): void {
  if (!videoPlayer || !subtitleText || !subtitleContainer || isNaN(videoPlayer.currentTime)) {
    return;
  }

  const currentTime = videoPlayer.currentTime * 1000;
  const foundSubtitle = findSubtitleAtTime(currentSubtitles, currentTime);

  if (foundSubtitle) {
    const normalizedText = foundSubtitle.text
      .replace(/\r\n?/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();

    if (!normalizedText) {
      hideCurrentSubtitle();
      return;
    }

    if (subtitleText.textContent !== normalizedText) {
      subtitleText.textContent = normalizedText;
    }
    subtitleContainer.style.display = "block";
  } else {
    hideCurrentSubtitle();
  }
}

/**
 * Start displaying subtitles
 */
export function startSubtitleDisplay(currentSubtitles: SubtitleSegment[]): void {
  if (!videoPlayer || !subtitleContainer) {
    console.warn("Cannot start subtitle display: Player or container missing.");
    return;
  }

  stopSubtitleDisplay();

  console.log("Starting subtitle display interval.");

  const updateFn = () => updateSubtitlesInternal(currentSubtitles);

  checkInterval = setInterval(updateFn, TIMING.SUBTITLE_UPDATE_INTERVAL_MS);

  videoPlayer.addEventListener("play", updateFn);
  videoPlayer.addEventListener("seeked", updateFn);

  (videoPlayer as VideoPlayerWithCallback)._subtitleUpdateFn = updateFn;
}

/**
 * Stop displaying subtitles
 */
export function stopSubtitleDisplay(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log("Stopped subtitle display interval.");
  }
  if (videoPlayer) {
    const player = videoPlayer as VideoPlayerWithCallback;
    if (player._subtitleUpdateFn) {
      videoPlayer.removeEventListener("play", player._subtitleUpdateFn);
      videoPlayer.removeEventListener("seeked", player._subtitleUpdateFn);
      delete player._subtitleUpdateFn;
    }
  }
}

/**
 * Hide the current subtitle
 */
export function hideCurrentSubtitle(): void {
  if (subtitleContainer) {
    subtitleContainer.style.display = "none";
  }
  if (subtitleText) {
    subtitleText.textContent = "";
  }
}

export function clearRenderer(): void {
  stopSubtitleDisplay();
  hideCurrentSubtitle();
}
