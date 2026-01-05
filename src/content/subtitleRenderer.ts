/**
 * Subtitle Renderer Module
 * Handles creation, display, and updates of subtitle elements on the YouTube video player.
 */

import type { FontSize } from "@/lib/constants";
import { ELEMENT_IDS, FONT_SIZES, YOUTUBE } from "@/lib/constants";
import type { SubtitleSegment } from "@/lib/storage";
import { extractVideoId } from "@/lib/url";

let videoPlayer: HTMLVideoElement | null = null;
let videoContainer: HTMLElement | null = null;
let activeVideoId: string | null = null;

/**
 * Manages the DOM elements for subtitles (View)
 */
class SubtitleView {
  private container: HTMLDivElement | null = null;
  private textElement: HTMLDivElement | null = null;

  constructor() {
    this.ensureElements();
  }

  ensureElements(): void {
    const existingContainer = document.getElementById(ELEMENT_IDS.SUBTITLE_CONTAINER) as HTMLDivElement | null;
    const existingText = document.getElementById(ELEMENT_IDS.SUBTITLE_TEXT) as HTMLDivElement | null;
    if (existingContainer && existingText) {
      this.container = existingContainer;
      this.textElement = existingText;
      return;
    }

    this.container = document.createElement("div");
    this.container.id = ELEMENT_IDS.SUBTITLE_CONTAINER;
    this.container.style.position = "absolute";
    this.container.style.zIndex = "9999";
    this.container.style.pointerEvents = "none";
    this.container.style.display = "none";

    this.textElement = document.createElement("div");
    this.textElement.id = ELEMENT_IDS.SUBTITLE_TEXT;
    this.container.appendChild(this.textElement);

    if (videoContainer) {
      if (getComputedStyle(videoContainer).position === "static") {
        videoContainer.style.position = "relative";
      }
      videoContainer.appendChild(this.container);
      console.log("Subtitle container added to video container.");
    } else {
      console.error("Cannot add subtitle container, video container not found.");
    }
  }

  setText(text: string): void {
    if (this.textElement && this.textElement.textContent !== text) {
      this.textElement.textContent = text;
    }
  }

  show(): void {
    if (this.container && this.container.style.display !== "block") {
      this.container.style.display = "block";
    }
  }

  hide(): void {
    if (this.container && this.container.style.display !== "none") {
      this.container.style.display = "none";
    }
    if (this.textElement) {
      this.textElement.textContent = "";
    }
  }

  applyFontSize(size: FontSize): void {
    const sizeConfig = FONT_SIZES.CAPTION[size] || FONT_SIZES.CAPTION.M;

    document.documentElement.style.setProperty("--caption-font-size-base", sizeConfig.base);
    document.documentElement.style.setProperty("--caption-font-size-max", sizeConfig.max);
    document.documentElement.style.setProperty("--caption-font-size-min", sizeConfig.min);
    document.documentElement.style.setProperty("--caption-font-size-fullscreen", sizeConfig.fullscreen);
    document.documentElement.style.setProperty("--caption-font-size-fullscreen-max", sizeConfig.fullscreenMax);

    if (this.textElement) {
      this.textElement.style.fontSize = `clamp(${sizeConfig.min}, ${sizeConfig.base}, ${sizeConfig.max})`;
    }
  }
}

/**
 * Controller for managing subtitle display and playback synchronization
 */
class SubtitleController {
  private rafId: number | null = null;
  private videoPlayer: HTMLVideoElement;
  private subtitles: SubtitleSegment[];
  private view: SubtitleView;

  constructor(videoPlayer: HTMLVideoElement, subtitles: SubtitleSegment[], view: SubtitleView) {
    this.videoPlayer = videoPlayer;
    this.subtitles = subtitles;
    this.view = view;
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
    this.view.hide();
  }

  private update = (): void => {
    if (activeVideoId && extractVideoId(window.location.href) !== activeVideoId) {
      stopSubtitleDisplay();
      return;
    }

    if (isNaN(this.videoPlayer.currentTime)) return;

    const currentTime = this.videoPlayer.currentTime * 1000;
    const foundSubtitle = this.findSubtitleAtTime(currentTime);

    if (foundSubtitle) {
      const normalizedText = normalizeSubtitleText(foundSubtitle.text);

      if (!normalizedText) {
        this.view.hide();
        return;
      }

      this.view.setText(normalizedText);
      this.view.show();
    } else {
      this.view.hide();
    }
  };

  private findSubtitleAtTime(timeMs: number): SubtitleSegment | null {
    let low = 0;
    let high = this.subtitles.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const subtitle = this.subtitles[mid];

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
let subtitleView: SubtitleView | null = null;

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
  if (!subtitleView) {
    subtitleView = new SubtitleView();
  } else {
    subtitleView.ensureElements();
  }
}

/**
 * Apply caption font size
 */
export function applyCaptionFontSize(size: FontSize): void {
  if (!subtitleView) createSubtitleElements();
  subtitleView?.applyFontSize(size);
}

/**
 * Start displaying subtitles
 */
export function startSubtitleDisplay(currentSubtitles: SubtitleSegment[], videoId: string): void {
  if (!videoPlayer) {
    console.warn("Cannot start subtitle display: Player missing.");
    return;
  }

  if (!subtitleView) createSubtitleElements();
  if (!subtitleView) return;

  stopSubtitleDisplay();
  activeVideoId = videoId;

  console.log("Starting subtitle display interval.");

  activeController = new SubtitleController(videoPlayer, currentSubtitles, subtitleView);
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

export function clearRenderer(): void {
  stopSubtitleDisplay();
  subtitleView?.hide();
  activeVideoId = null;
}

function normalizeSubtitleText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n").trim();
}
