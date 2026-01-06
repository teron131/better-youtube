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
  getTargetLanguageFromStorage,
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
import { convertSubtitlesForTargetLanguage } from "./captionConversion";

/**
 * Manages the content script lifecycle and state
 */
class ContentManager {
  public state: ContentScriptState = {
    currentSubtitles: [],
    showSubtitlesEnabled: true,
    userInteractedWithToggle: false,
  };

  private currentUrl: string = window.location.href;
  private urlObserver: MutationObserver | null = null;

  constructor() {
    this.checkAndTriggerAutoGeneration = this.checkAndTriggerAutoGeneration.bind(this);
    this.clearSubtitles = this.clearSubtitles.bind(this);
  }

  /**
   * Initialize the content script
   */
  public initialize(attempts = 0): void {
    if (!window.location.href.includes("youtube.com/watch")) return;

    if (!findVideoElements()) {
      if (attempts < TIMING.MAX_INIT_ATTEMPTS) {
        setTimeout(() => this.initialize(attempts + 1), TIMING.INIT_RETRY_DELAY_MS);
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
          if (oldVideoId) clearAutoGenerationTrigger(oldVideoId);
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
    const keysToFetch = [videoId, ...buildStorageKeysForVideo()];

    chrome.storage.local.get(keysToFetch, (result) => {
      if (chrome.runtime.lastError || !isCurrentVideo(videoId)) return;

      if (!this.state.userInteractedWithToggle) {
        this.state.showSubtitlesEnabled = result[STORAGE_KEYS.SHOW_SUBTITLES] !== false;
      }

      if (result[videoId]) {
        console.log("Found stored subtitles.");
        const targetLanguage = getTargetLanguageFromStorage(result);
        this.state.currentSubtitles = convertSubtitlesForTargetLanguage(
          result[videoId] as SubtitleSegment[],
          targetLanguage
        );
        if (this.state.showSubtitlesEnabled) startSubtitleDisplay(this.state.currentSubtitles, videoId);
      } else {
        this.checkAndTriggerAutoGeneration(videoId, result, true, true);
      }
    });
  }

  private loadCaptionFontSize(): void {
    if (!isExtensionContextValid()) return;
    chrome.storage.local.get([STORAGE_KEYS.CAPTION_FONT_SIZE], (result) => {
      if (chrome.runtime.lastError) return;
      const fontSize = (result?.[STORAGE_KEYS.CAPTION_FONT_SIZE] || DEFAULTS.CAPTION_FONT_SIZE) as FontSize;
      applyCaptionFontSize(fontSize);
    });
  }

  public clearSubtitles(): void {
    this.state.currentSubtitles = [];
    clearRenderer();
  }

  /**
   * Check if auto-generation should be triggered
   */
  public async checkAndTriggerAutoGeneration(
    videoId: string,
    storageResult: Record<string, unknown>,
    checkCaptionsEnabled = true,
    withDelay = false
  ): Promise<boolean> {
    const validation = validateAutoGenerationConditions(
      videoId,
      storageResult,
      this.state.showSubtitlesEnabled,
      checkCaptionsEnabled
    );

    if (!validation.isValid) return false;

    scheduleAutoGeneration(videoId, () => this.triggerAutoGeneration(videoId, storageResult), checkCaptionsEnabled, withDelay);
    return true;
  }

  /**
   * Trigger automatic processing: Scrape first, then refine
   */
  private async triggerAutoGeneration(
    videoId: string,
    storageResult: Record<string, unknown>
  ): Promise<void> {
    this.clearSubtitles();

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
    checkAndTriggerAutoGeneration: manager.checkAndTriggerAutoGeneration
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    setTimeout(run, TIMING.CONTENT_SCRIPT_INIT_DELAY_MS);
  }
})();
