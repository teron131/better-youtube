/**
 * Subtitle Renderer Module
 * Handles creation, display, and updates of subtitle elements on the YouTube video player.
 */

import type { FontSize } from "@/lib/constants";
import { ELEMENT_IDS, FONT_SIZES, YOUTUBE } from "@/lib/constants";
import type { SubtitleSegment } from "@/lib/storage";
import { extractVideoId } from "@/lib/url";

let subtitleContainer: HTMLDivElement | null = null;
let subtitleText: HTMLDivElement | null = null;
let videoPlayer: HTMLVideoElement | null = null;
let videoContainer: HTMLElement | null = null;
let activeVideoId: string | null = null;

/**
 * Controller for managing subtitle display and playback synchronization
 */
class SubtitleController {
  private rafId: number | null = null;
  private videoPlayer: HTMLVideoElement;
  private subtitles: SubtitleSegment[];
  private videoId: string;

  constructor(videoPlayer: HTMLVideoElement, subtitles: SubtitleSegment[], videoId: string) {
    this.videoPlayer = videoPlayer;
    this.subtitles = subtitles;
    this.videoId = videoId;
  }

  start(): void {
    this.update();
    if (!this.videoPlayer.paused && !this.videoPlayer.ended) {
      this.startLoop();
    }
    this.attachEventListeners();
  }

  stop(): void {
    this.stopLoop();
    this.detachEventListeners();
  }

  private update = (): void => {
    updateSubtitlesInternal(this.subtitles);
  };

  private startLoop = (): void => {
    this.stopLoop();
    const tick = () => {
      this.update();
      if (!this.videoPlayer.paused && !this.videoPlayer.ended) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  };

  private stopLoop = (): void => {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  private handleSeeked = (): void => {
    this.update();
    if (!this.videoPlayer.paused && !this.videoPlayer.ended) {
      this.startLoop();
    }
  };

  private attachEventListeners(): void {
    this.videoPlayer.addEventListener("play", this.startLoop);
    this.videoPlayer.addEventListener("pause", this.stopLoop);
    this.videoPlayer.addEventListener("ended", this.stopLoop);
    this.videoPlayer.addEventListener("seeked", this.handleSeeked);
  }

  private detachEventListeners(): void {
    this.videoPlayer.removeEventListener("play", this.startLoop);
    this.videoPlayer.removeEventListener("pause", this.stopLoop);
    this.videoPlayer.removeEventListener("ended", this.stopLoop);
    this.videoPlayer.removeEventListener("seeked", this.handleSeeked);
  }
}

let activeController: SubtitleController | null = null;

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
  if (activeVideoId && extractVideoId(window.location.href) !== activeVideoId) {
    stopSubtitleDisplay();
    hideCurrentSubtitle();
    return;
  }

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
export function startSubtitleDisplay(currentSubtitles: SubtitleSegment[], videoId: string): void {
  if (!videoPlayer || !subtitleContainer) {
    console.warn("Cannot start subtitle display: Player or container missing.");
    return;
  }

  stopSubtitleDisplay();
  activeVideoId = videoId;

  console.log("Starting subtitle display interval.");

  activeController = new SubtitleController(videoPlayer, currentSubtitles, videoId);
  activeController.start();
}

/**
 * Stop displaying subtitles
 */
export function stopSubtitleDisplay(): void {
  activeController?.stop();
  activeController = null;
  activeVideoId = null;
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
  activeVideoId = null;
}
