/**
 * Subtitle Renderer Module
 * Handles creation, display, and updates of subtitle elements on the YouTube video player.
 */

import type { FontSize } from "@/core/constants";
import { ELEMENT_IDS, FONT_SIZES, YOUTUBE } from "@/core/constants";
import type { SubtitleSegment } from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

let videoPlayer: HTMLVideoElement | null = null;
let videoContainer: HTMLElement | null = null;
let activeVideoId: string | null = null;
let cachedPageUrl = "";
let cachedPageVideoId: string | null = null;

function getCurrentPageVideoId(): string | null {
	const currentUrl = window.location.href;
	if (currentUrl !== cachedPageUrl) {
		cachedPageUrl = currentUrl;
		cachedPageVideoId = extractVideoId(currentUrl);
	}

	return cachedPageVideoId;
}

/**
 * Manages the DOM elements for subtitles (View)
 */
class SubtitleView {
	private container: HTMLDivElement | null = null;
	private textElement: HTMLDivElement | null = null;
	private currentText = "";
	private isVisible = false;

	constructor() {
		this.ensureElements();
	}

	ensureElements(): void {
		const existingContainer = document.getElementById(
			ELEMENT_IDS.SUBTITLE_CONTAINER,
		) as HTMLDivElement | null;
		const existingText = document.getElementById(
			ELEMENT_IDS.SUBTITLE_TEXT,
		) as HTMLDivElement | null;
		if (existingContainer && existingText) {
			this.container = existingContainer;
			this.textElement = existingText;
			this.currentText = existingText.textContent || "";
			this.isVisible = getComputedStyle(existingContainer).display !== "none";
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
			console.error(
				"Cannot add subtitle container, video container not found.",
			);
		}
	}

	setText(text: string): void {
		if (this.textElement && this.currentText !== text) {
			this.textElement.textContent = text;
			this.currentText = text;
		}
	}

	show(): void {
		if (this.container && !this.isVisible) {
			this.container.style.display = "block";
			this.isVisible = true;
		}
	}

	hide(): void {
		if (this.container && this.isVisible) {
			this.container.style.display = "none";
			this.isVisible = false;
		}
		if (this.textElement && this.currentText) {
			this.textElement.textContent = "";
			this.currentText = "";
		}
	}

	applyFontSize(size: FontSize): void {
		const sizeConfig = FONT_SIZES.CAPTION[size] || FONT_SIZES.CAPTION.M;

		document.documentElement.style.setProperty(
			"--caption-font-size-base",
			sizeConfig.base,
		);
		document.documentElement.style.setProperty(
			"--caption-font-size-max",
			sizeConfig.max,
		);
		document.documentElement.style.setProperty(
			"--caption-font-size-min",
			sizeConfig.min,
		);
		document.documentElement.style.setProperty(
			"--caption-font-size-fullscreen",
			sizeConfig.fullscreen,
		);
		document.documentElement.style.setProperty(
			"--caption-font-size-fullscreen-max",
			sizeConfig.fullscreenMax,
		);

		if (this.textElement) {
			this.textElement.style.fontSize = `clamp(${sizeConfig.min}, ${sizeConfig.base}, ${sizeConfig.max})`;
		}
	}
}

/**
 * Controller for managing subtitle display and playback synchronization
 */
class SubtitleController {
	private animationFrameId: number | null = null;
	private videoPlayer: HTMLVideoElement;
	private subtitles: SubtitleSegment[] = [];
	private maxEndTimeThroughIndex: number[] = [];
	private view: SubtitleView;
	private activeSubtitleIndex = -1;
	private normalizedSubtitleCache = new Map<number, string>();

	constructor(
		videoPlayer: HTMLVideoElement,
		subtitles: SubtitleSegment[],
		view: SubtitleView,
	) {
		this.videoPlayer = videoPlayer;
		this.view = view;
		this.replaceSubtitles(subtitles);
	}

	start(): void {
		this.attachEventListeners();
		this.syncPlayback();
		this.startFrameSync();
	}

	stop(): void {
		this.stopFrameSync();
		this.detachEventListeners();
		this.view.hide();
	}

	updateSubtitles(subtitles: SubtitleSegment[]): void {
		this.replaceSubtitles(subtitles);
		this.activeSubtitleIndex = -1;
		this.syncPlayback();
		this.startFrameSync();
	}

	private replaceSubtitles(subtitles: SubtitleSegment[]): void {
		this.subtitles = subtitles;
		this.normalizedSubtitleCache.clear();
		let maxEndTime = Number.NEGATIVE_INFINITY;
		this.maxEndTimeThroughIndex = subtitles.map((subtitle) => {
			maxEndTime = Math.max(maxEndTime, subtitle.endTime);
			return maxEndTime;
		});
	}

	private syncPlayback = (): void => {
		if (activeVideoId && getCurrentPageVideoId() !== activeVideoId) {
			stopSubtitleDisplay();
			return;
		}

		if (Number.isNaN(this.videoPlayer.currentTime)) {
			return;
		}

		const currentTime = this.videoPlayer.currentTime * 1000;
		const nextSubtitleIndex = this.findSubtitleIndex(currentTime);

		if (nextSubtitleIndex === this.activeSubtitleIndex) {
			return;
		}

		this.activeSubtitleIndex = nextSubtitleIndex;

		if (nextSubtitleIndex < 0) {
			this.view.hide();
			return;
		}

		const normalizedText = this.getNormalizedSubtitleText(nextSubtitleIndex);
		if (!normalizedText) {
			this.view.hide();
			return;
		}

		this.view.setText(normalizedText);
		this.view.show();
	};

	private getNormalizedSubtitleText(subtitleIndex: number): string {
		const cachedText = this.normalizedSubtitleCache.get(subtitleIndex);
		if (cachedText !== undefined) {
			return cachedText;
		}

		const normalizedText = normalizeSubtitleText(
			this.subtitles[subtitleIndex]?.text || "",
		);
		this.normalizedSubtitleCache.set(subtitleIndex, normalizedText);
		return normalizedText;
	}

	private findSubtitleIndex(timeMs: number): number {
		// YouTube transcript ranges can overlap; prefer the latest started active segment.
		const latestStartedIndex = this.findLatestStartedSubtitleIndex(timeMs);

		for (let index = latestStartedIndex; index >= 0; index--) {
			if (this.maxEndTimeThroughIndex[index] <= timeMs) {
				return -1;
			}

			const subtitle = this.subtitles[index];
			if (timeMs >= subtitle.startTime && timeMs < subtitle.endTime) {
				return index;
			}
		}

		return -1;
	}

	private findLatestStartedSubtitleIndex(timeMs: number): number {
		let low = 0;
		let high = this.subtitles.length;

		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (this.subtitles[mid].startTime <= timeMs) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}

		return low - 1;
	}

	private startFrameSync(): void {
		if (this.animationFrameId !== null) {
			return;
		}

		if (this.videoPlayer.paused || this.videoPlayer.ended) {
			return;
		}

		this.animationFrameId = window.requestAnimationFrame(this.runFrameSync);
	}

	private stopFrameSync(): void {
		if (this.animationFrameId !== null) {
			window.cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	private runFrameSync = (): void => {
		this.animationFrameId = null;
		this.syncPlayback();
		this.startFrameSync();
	};

	private handlePlay = (): void => {
		this.syncPlayback();
		this.startFrameSync();
	};

	private handlePause = (): void => {
		this.stopFrameSync();
	};

	private handleEnded = (): void => {
		this.stopFrameSync();
		this.view.hide();
	};

	private handleSeeked = (): void => {
		this.activeSubtitleIndex = -1;
		this.syncPlayback();
		this.startFrameSync();
	};

	private handleTimeUpdate = (): void => {
		this.syncPlayback();
	};

	private attachEventListeners(): void {
		this.videoPlayer.addEventListener("play", this.handlePlay);
		this.videoPlayer.addEventListener("pause", this.handlePause);
		this.videoPlayer.addEventListener("ended", this.handleEnded);
		this.videoPlayer.addEventListener("seeked", this.handleSeeked);
		this.videoPlayer.addEventListener("timeupdate", this.handleTimeUpdate);
		this.videoPlayer.addEventListener("ratechange", this.syncPlayback);
	}

	private detachEventListeners(): void {
		this.videoPlayer.removeEventListener("play", this.handlePlay);
		this.videoPlayer.removeEventListener("pause", this.handlePause);
		this.videoPlayer.removeEventListener("ended", this.handleEnded);
		this.videoPlayer.removeEventListener("seeked", this.handleSeeked);
		this.videoPlayer.removeEventListener("timeupdate", this.handleTimeUpdate);
		this.videoPlayer.removeEventListener("ratechange", this.syncPlayback);
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
export function startSubtitleDisplay(
	currentSubtitles: SubtitleSegment[],
	videoId: string,
): void {
	if (!videoPlayer) {
		console.warn("Cannot start subtitle display: Player missing.");
		return;
	}

	if (!subtitleView) createSubtitleElements();
	if (!subtitleView) return;

	if (activeController && activeVideoId === videoId) {
		activeController.updateSubtitles(currentSubtitles);
		return;
	}

	stopSubtitleDisplay();
	activeVideoId = videoId;

	console.log("Starting subtitle display sync.");

	activeController = new SubtitleController(
		videoPlayer,
		currentSubtitles,
		subtitleView,
	);
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
	return text
		.replace(/\r\n?/g, "\n")
		.replace(/\n{2,}/g, "\n")
		.trim();
}
