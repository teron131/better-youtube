/// <reference types="chrome" />

/**
 * Content Script for Better YouTube Chrome Extension
 * Handles subtitle display, auto-generation, and communication with background script
 */

import type { FontSize } from "@/core/constants";
import { DEFAULTS, STORAGE_KEYS, TIMING } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import type { SubtitleSegment } from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

import {
	clearAutoGenTrigger,
	isExtensionContextValid,
	scheduleAutoGen,
	validateAutoGen,
} from "./autoGeneration";
import {
	type ContentScriptState,
	triggerCaptionRefinement,
} from "./contentHelpers";
import { setupMessageListener } from "./messageHandler";
import { startRecommendationFiltering } from "./recommendationFiltering";
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
		currentVideoId: undefined,
		currentCaptionRequestId: undefined,
	};

	private currentUrl: string = window.location.href;
	private isUrlMonitoringStarted = false;
	private urlCheckTimeout: number | null = null;
	private urlCheckIntervalId: number | null = null;

	constructor() {
		this.checkAndTriggerAutoGeneration =
			this.checkAndTriggerAutoGeneration.bind(this);
		this.clearSubtitles = this.clearSubtitles.bind(this);
		this.handlePotentialUrlChange = this.handlePotentialUrlChange.bind(this);
		this.scheduleUrlCheck = this.scheduleUrlCheck.bind(this);
	}

	/**
	 * Initialize the content script
	 */
	public initialize(attempts = 0): void {
		if (!this.isUrlMonitoringStarted) {
			this.monitorUrlChanges();
			this.isUrlMonitoringStarted = true;
		}

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
	}

	/**
	 * Monitor URL changes on YouTube
	 */
	private monitorUrlChanges(): void {
		document.addEventListener("yt-navigate-finish", this.scheduleUrlCheck);
		document.addEventListener("yt-page-data-updated", this.scheduleUrlCheck);
		window.addEventListener("popstate", this.scheduleUrlCheck);
		window.addEventListener("hashchange", this.scheduleUrlCheck);
		document.addEventListener("visibilitychange", this.scheduleUrlCheck);

		if (this.urlCheckIntervalId === null) {
			this.urlCheckIntervalId = window.setInterval(
				this.handlePotentialUrlChange,
				TIMING.CAPTION_CHECK_DELAY_MS,
			);
		}
	}

	private scheduleUrlCheck(): void {
		if (this.urlCheckTimeout !== null) {
			window.clearTimeout(this.urlCheckTimeout);
		}

		this.urlCheckTimeout = window.setTimeout(() => {
			this.urlCheckTimeout = null;
			this.handlePotentialUrlChange();
		}, 0);
	}

	private handlePotentialUrlChange(): void {
		if (!isExtensionContextValid()) {
			return;
		}

		const newUrl = window.location.href;
		if (this.currentUrl === newUrl) {
			return;
		}

		const oldVideoId = extractVideoId(this.currentUrl);
		const newVideoId = extractVideoId(newUrl);
		this.currentUrl = newUrl;

		// Only trigger updates if the video ID actually changed
		if (oldVideoId !== newVideoId) {
			if (oldVideoId) clearAutoGenTrigger(oldVideoId);
			this.onUrlChange();
		}
	}

	private onUrlChange(): void {
		this.clearSubtitles();
		this.state.userInteractedWithToggle = false;
		this.initialize();
	}

	/**
	 * Load subtitles from storage and initialize display
	 */
	private loadStoredSubtitles(): void {
		if (!isExtensionContextValid()) return;

		const validation = validateLoadContext();
		if (!validation.isValid || !validation.videoId) return;

		const videoId = validation.videoId;
		this.state.currentVideoId = videoId;
		const keysToFetch = [
			videoId,
			STORAGE_KEYS.CAPTION_FONT_SIZE,
			...getVideoStorageKeys(),
		];

		chrome.storage.local.get(keysToFetch, (result) => {
			if (
				chrome.runtime.lastError ||
				!isCurrentVideo(videoId) ||
				this.state.currentVideoId !== videoId
			) {
				return;
			}

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
		this.state.currentVideoId = undefined;
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
		this.state.currentVideoId = videoId;

		if (await executeScrapeForAutoGen(videoId)) {
			if (storageResult[STORAGE_KEYS.SHOW_SUBTITLES] !== false) {
				const refinerModel = await getRefinerModel();
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
		startRecommendationFiltering();
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
