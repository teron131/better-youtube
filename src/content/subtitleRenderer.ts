/**
 * Subtitle Renderer Module
 * Handles creation, display, and updates of subtitle elements on the YouTube video player.
 */

import type { FontSize } from "@/core/constants";
import { ELEMENT_IDS, FONT_SIZES, YOUTUBE } from "@/core/constants";
import type { SubtitleSegment } from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

const MIN_SUBTITLE_SYNC_DELAY_MS = 50;
const MAX_SUBTITLE_SYNC_DELAY_MS = 1000;

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
	private syncTimeoutId: number | null = null;
	private videoPlayer: HTMLVideoElement;
	private subtitles: SubtitleSegment[];
	private view: SubtitleView;
	private activeSubtitleIndex = -1;
	private normalizedSubtitleCache = new Map<number, string>();

	constructor(
		videoPlayer: HTMLVideoElement,
		subtitles: SubtitleSegment[],
		view: SubtitleView,
	) {
		this.videoPlayer = videoPlayer;
		this.subtitles = subtitles;
		this.view = view;
	}

	start(): void {
		this.attachEventListeners();
		this.syncPlayback();
	}

	stop(): void {
		this.stopScheduledSync();
		this.detachEventListeners();
		this.view.hide();
	}

	private syncPlayback = (): void => {
		this.stopScheduledSync();

		if (activeVideoId && getCurrentPageVideoId() !== activeVideoId) {
			stopSubtitleDisplay();
			return;
		}

		if (Number.isNaN(this.videoPlayer.currentTime)) {
			this.scheduleNextSync(MAX_SUBTITLE_SYNC_DELAY_MS);
			return;
		}

		const currentTime = this.videoPlayer.currentTime * 1000;
		const nextSubtitleIndex = this.findSubtitleIndex(currentTime);
		const nextSyncDelay = this.getNextSyncDelay(currentTime);

		if (nextSubtitleIndex === this.activeSubtitleIndex) {
			this.scheduleNextSync(nextSyncDelay);
			return;
		}

		this.activeSubtitleIndex = nextSubtitleIndex;

		if (nextSubtitleIndex < 0) {
			this.view.hide();
			this.scheduleNextSync(nextSyncDelay);
			return;
		}

		const normalizedText = this.getNormalizedSubtitleText(nextSubtitleIndex);
		if (!normalizedText) {
			this.view.hide();
			this.scheduleNextSync(nextSyncDelay);
			return;
		}

		this.view.setText(normalizedText);
		this.view.show();
		this.scheduleNextSync(nextSyncDelay);
	};

	private findSubtitleIndex(timeMs: number): number {
		const activeSubtitle = this.subtitles[this.activeSubtitleIndex];
		if (
			activeSubtitle &&
			timeMs >= activeSubtitle.startTime &&
			timeMs < activeSubtitle.endTime
		) {
			return this.activeSubtitleIndex;
		}

		let low =
			activeSubtitle &&
			this.activeSubtitleIndex >= 0 &&
			timeMs >= activeSubtitle.endTime
				? this.activeSubtitleIndex + 1
				: 0;
		let high = this.subtitles.length - 1;

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const subtitle = this.subtitles[mid];

			if (timeMs >= subtitle.startTime && timeMs < subtitle.endTime) {
				return mid;
			} else if (timeMs < subtitle.startTime) {
				high = mid - 1;
			} else {
				low = mid + 1;
			}
		}

		return -1;
	}

	private findFirstSubtitleStartingAfter(timeMs: number): number {
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

		return low;
	}

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

	private getNextSyncDelay(currentTime: number): number {
		if (this.videoPlayer.paused || this.videoPlayer.ended) {
			return MAX_SUBTITLE_SYNC_DELAY_MS;
		}

		const activeSubtitle = this.subtitles[this.activeSubtitleIndex];
		const nextBoundaryMs =
			activeSubtitle && currentTime < activeSubtitle.endTime
				? activeSubtitle.endTime
				: (this.subtitles[this.findFirstSubtitleStartingAfter(currentTime)]
						?.startTime ?? null);

		if (nextBoundaryMs === null) {
			return MAX_SUBTITLE_SYNC_DELAY_MS;
		}

		const playbackRate = Math.max(this.videoPlayer.playbackRate || 1, 0.25);
		const wallClockDelayMs = (nextBoundaryMs - currentTime) / playbackRate;
		return Math.max(
			MIN_SUBTITLE_SYNC_DELAY_MS,
			Math.min(MAX_SUBTITLE_SYNC_DELAY_MS, Math.ceil(wallClockDelayMs)),
		);
	}

	private scheduleNextSync(delayMs: number): void {
		if (this.videoPlayer.paused || this.videoPlayer.ended) {
			return;
		}

		this.syncTimeoutId = window.setTimeout(this.syncPlayback, delayMs);
	}

	private stopScheduledSync(): void {
		if (this.syncTimeoutId !== null) {
			window.clearTimeout(this.syncTimeoutId);
			this.syncTimeoutId = null;
		}
	}

	private handlePlay = (): void => {
		this.syncPlayback();
	};

	private handlePause = (): void => {
		this.stopScheduledSync();
	};

	private handleEnded = (): void => {
		this.stopScheduledSync();
		this.view.hide();
	};

	private handleSeeked = (): void => {
		this.activeSubtitleIndex = -1;
		this.syncPlayback();
	};

	private handleTimeUpdate = (): void => {
		if (this.syncTimeoutId === null) {
			this.syncPlayback();
		}
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
