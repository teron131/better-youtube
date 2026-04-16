/**
 * Message Handler for Content Script
 */

import type { FontSize } from "@/core/constants";
import {
	DEFAULTS,
	MESSAGE_ACTIONS,
	STORAGE_KEYS,
	YOUTUBE,
} from "@/core/constants";
import { createRequestId, type RequestId } from "@/core/requestId";
import {
	type SubtitleSegment,
	saveSubtitles,
	setStorageValue,
} from "@/core/storage";
import { sendChromeMessage } from "@/core/utils/chrome";
import { toTraditionalChinese } from "@/core/utils/text";
import { extractVideoId } from "@/core/utils/url";
import { clearAutoGenTrigger, markAutoGenTriggered } from "./autoGeneration";
import type { ContentScriptState } from "./contentHelpers";
import { getToggleStorageKeys } from "./storageHelpers";
import {
	applyCaptionFontSize,
	clearRenderer,
	startSubtitleDisplay,
	stopSubtitleDisplay,
} from "./subtitleRenderer";
import { determineToggleState, isCurrentVideo } from "./videoHelpers";

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

function resolveVideoIdOrRespond(
	message: any,
	sendResponse: (response: any) => void,
): string | null {
	const videoId = message.videoId || extractVideoId(window.location.href);
	if (videoId) return videoId;
	sendResponse({
		status: "error",
		message: "Could not extract video ID from URL.",
	});
	return null;
}

function sendStarted(sendResponse: (response: any) => void): void {
	sendResponse({ status: "started" });
}

function getActiveVideoId(state: ContentScriptState): string | null {
	return state.currentVideoId || extractVideoId(window.location.href);
}

function handleGenerateSummary(
	message: any,
	sendResponse: (response: any) => void,
): void {
	const videoId = resolveVideoIdOrRespond(message, sendResponse);
	if (!videoId) return;

	const requestId: RequestId | undefined = message.requestId as
		| RequestId
		| undefined;

	sendChromeMessage({
		action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
		videoId,
		requestId,
		modelSelection: message.modelSelection,
		targetLanguage: message.targetLanguage,
		qualityModel: message.qualityModel,
		summarizerMode: message.summarizerMode,
	}).catch((error) => {
		console.error("Error sending generate summary message:", error.message);
	});

	sendStarted(sendResponse);
}

function handleGenerateSubtitles(
	message: any,
	state: ContentScriptState,
	clearSubtitles: () => void,
	sendResponse: (response: any) => void,
): void {
	const videoId = resolveVideoIdOrRespond(message, sendResponse);
	if (!videoId) return;

	clearSubtitles();
	markAutoGenTriggered(videoId);
	state.currentVideoId = videoId;

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
				clearAutoGenTrigger(videoId);
			}
		})
		.catch((error) => {
			console.error("Error communicating with background:", error.message);
		});

	sendStarted(sendResponse);
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

	const convertedSubtitles = toTraditionalChinese(subtitles);
	handleConvertedSubtitles(
		convertedSubtitles,
		messageVideoId,
		messageRequestId,
		isPartial,
		state,
		sendResponse,
	);
}

function handleConvertedSubtitles(
	convertedSubtitles: SubtitleSegment[],
	messageVideoId: string | undefined,
	messageRequestId: RequestId | undefined,
	isPartial: boolean,
	state: ContentScriptState,
	sendResponse: (response: any) => void,
): void {
	const isCurrentRequest =
		!messageRequestId ||
		!state.currentCaptionRequestId ||
		messageRequestId === state.currentCaptionRequestId;
	const shouldPersistForMessageVideo =
		!isPartial &&
		messageVideoId &&
		convertedSubtitles.length > 0 &&
		isCurrentRequest;
	if (shouldPersistForMessageVideo) {
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

	state.currentSubtitles = isPartial
		? mergeSubtitleSegments(state.currentSubtitles, convertedSubtitles)
		: convertedSubtitles;
	if (state.currentSubtitles.length === 0) {
		state.currentSubtitles = [];
		clearRenderer();
		sendResponse({ status: "no_subtitles_found" });
		return;
	}

	startDisplayIfReady(state, messageVideoId);

	// Fallback save using current URL ID if message ID was missing (final only)
	if (!isPartial && !messageVideoId) {
		const currentVideoId = extractVideoId(window.location.href);
		if (currentVideoId) {
			saveSubtitles(currentVideoId, convertedSubtitles).catch(console.error);
		}
	}
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

	const updatedByRange = new Map(
		updatedSubtitles.map((subtitle) => [
			`${subtitle.startTime}:${subtitle.endTime}`,
			subtitle,
		]),
	);

	return existingSubtitles.map((subtitle) => {
		const updated = updatedByRange.get(
			`${subtitle.startTime}:${subtitle.endTime}`,
		);
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
	const nextState = determineToggleState(message);
	const wasEnabled = state.showSubtitlesEnabled;
	state.showSubtitlesEnabled = nextState;
	state.userInteractedWithToggle = true;
	void setStorageValue(
		STORAGE_KEYS.SHOW_SUBTITLES,
		state.showSubtitlesEnabled,
	).catch((error) => {
		console.error("Failed to persist subtitle toggle:", error);
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
		triggerAutoGenOnToggle(state, checkAndTriggerAutoGeneration);
	}

	sendResponse({ status: "success" });
}

/**
 * Trigger subtitle auto-generation when toggle is enabled without cached subtitles
 */
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

	const keysToFetch = [videoId, ...getToggleStorageKeys()];
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
	state.currentVideoId = resolvedVideoId || undefined;
	if (!resolvedVideoId) return;

	startSubtitleDisplay(state.currentSubtitles, resolvedVideoId);
}
