/**
 * Content Script for Better YouTube Chrome Extension
 * Handles subtitle display, auto-generation, and communication with background script
 */

import type { FontSize } from "@/core/constants";
import { DEFAULTS, STORAGE_KEYS, TIMING } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import { type SubtitleSegment } from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

import {
  clearAutoGenTrigger,
  isExtensionContextValid,
  scheduleAutoGen,
  validateAutoGen,
} from "./autoGeneration";
import { ContentScriptState, triggerCaptionRefinement } from "./contentHelpers";
import { setupMessageListener } from "./messageHandler";
import { getRefinerModel, getVideoStorageKeys } from "./storageHelpers";
import {
  applyCaptionFontSize,
  clearRenderer,
  createSubtitleElements,
  findVideoElements,
  startSubtitleDisplay,
} from "./subtitleRenderer";
import {
  executeScrapeForAutoGen,
  isCurrentVideo,
  validateLoadContext,
} from "./videoHelpers";

/**
 * Manages the content script lifecycle and state
 */
class ContentManager {
  public state: ContentScriptState = {
    currentSubtitles: [],
    showSubtitlesEnabled: true,
    userInteractedWithToggle: false,
    currentCaptionRequestId: undefined,
  };

  private currentUrl: string = window.location.href;
  private urlObserver: MutationObserver | null = null;

  constructor() {
    this.checkAndTriggerAutoGeneration =
      this.checkAndTriggerAutoGeneration.bind(this);
    this.clearSubtitles = this.clearSubtitles.bind(this);
  }

  /**
   * Initialize the content script
   */
  public initialize(attempts = 0): void {
    if (!window.location.href.includes("youtube.com/watch")) return;

    if (!findVideoElements()) {
      if (attempts < TIMING.MAX_INIT_ATTEMPTS) {
        setTimeout(
          () => this.initialize(attempts + 1),
          TIMING.INIT_RETRY_DELAY_MS,
        );
      }
      return;
    }

    createSubtitleElements();
    this.loadStoredSubtitles();
    this.loadCaptionFontSize();
    this.monitorUrlChanges();
  }

  /**
   * Monitor URL changes on YouTube
   */
  private monitorUrlChanges(): void {
    this.urlObserver?.disconnect();
    this.urlObserver = new MutationObserver(() => {
      if (!isExtensionContextValid()) {
        this.urlObserver?.disconnect();
        return;
      }

      const newUrl = window.location.href;
      if (this.currentUrl !== newUrl) {
        const oldVideoId = extractVideoId(this.currentUrl);
        const newVideoId = extractVideoId(newUrl);
        this.currentUrl = newUrl;

        // Only trigger updates if the video ID actually changed
        if (oldVideoId !== newVideoId) {
          if (oldVideoId) clearAutoGenTrigger(oldVideoId);
          this.onUrlChange();
        }
      }
    });
    this.urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  private onUrlChange(): void {
    this.clearSubtitles();
    this.state.userInteractedWithToggle = false;
    // Re-initialize for the new video
    // We don't need to find elements again usually, but we need to load subtitles
    this.loadStoredSubtitles();
  }

  /**
   * Load subtitles from storage and initialize display
   */
  private loadStoredSubtitles(): void {
    if (!isExtensionContextValid()) return;

    const validation = validateLoadContext();
    if (!validation.isValid || !validation.videoId) return;

    const videoId = validation.videoId;
    const keysToFetch = [
      videoId,
      STORAGE_KEYS.CAPTION_FONT_SIZE,
      ...getVideoStorageKeys(),
    ];

    chrome.storage.local.get(keysToFetch, (result) => {
      if (chrome.runtime.lastError || !isCurrentVideo(videoId)) return;

      // Apply font size
      const fontSize = (result?.[STORAGE_KEYS.CAPTION_FONT_SIZE] ||
        DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
      applyCaptionFontSize(fontSize);

      if (!this.state.userInteractedWithToggle) {
        this.state.showSubtitlesEnabled =
          result[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
      }

      if (result[videoId]) {
        console.log("Found stored subtitles (already converted).");
        this.state.currentSubtitles = result[videoId] as SubtitleSegment[];
        if (this.state.showSubtitlesEnabled)
          startSubtitleDisplay(this.state.currentSubtitles, videoId);
      } else {
        this.checkAndTriggerAutoGeneration(videoId, result, true, true);
      }
    });
  }

  private loadCaptionFontSize(): void {
    // Font size is now loaded in loadStoredSubtitles() for better performance
  }

  public clearSubtitles(): void {
    this.state.currentSubtitles = [];
    this.state.currentCaptionRequestId = undefined;
    clearRenderer();
  }

  /**
   * Check if auto-generation should be triggered
   */
  public async checkAndTriggerAutoGeneration(
    videoId: string,
    storageResult: Record<string, unknown>,
    checkCaptionsEnabled = true,
    withDelay = false,
  ): Promise<boolean> {
    const validation = validateAutoGen(
      videoId,
      storageResult,
      this.state.showSubtitlesEnabled,
      checkCaptionsEnabled,
    );

    if (!validation.isValid) return false;

    scheduleAutoGen(
      videoId,
      () => this.triggerAutoGeneration(videoId, storageResult),
      checkCaptionsEnabled,
      withDelay,
    );
    return true;
  }

  /**
   * Trigger automatic processing: Scrape first, then refine
   */
  private async triggerAutoGeneration(
    videoId: string,
    storageResult: Record<string, unknown>,
  ): Promise<void> {
    this.clearSubtitles();

    if (await executeScrapeForAutoGen(videoId)) {
      if (storageResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false) {
        const refinerModel = getRefinerModel(storageResult);
        const requestId = createRequestId("caption");
        this.state.currentCaptionRequestId = requestId;
        triggerCaptionRefinement(
          videoId,
          requestId,
          refinerModel,
          clearAutoGenTrigger,
        );
      }
    } else {
      clearAutoGenTrigger(videoId);
    }
  }
}

// Start re-initialization
(function start() {
  const manager = new ContentManager();

  const run = () => {
    manager.initialize();
  };

  // Setup message listener exactly once
  setupMessageListener(manager.state, {
    clearSubtitles: manager.clearSubtitles,
    checkAndTriggerAutoGeneration: manager.checkAndTriggerAutoGeneration,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    setTimeout(run, TIMING.CONTENT_SCRIPT_INIT_DELAY_MS);
  }
})();
