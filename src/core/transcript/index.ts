import type { TranscriptProviderPreference } from "../config.ts";
import {
	globalScrapeCreatorsKey,
	globalSupadataKey,
	globalTranscriptProviderPreference,
} from "../runtimeConfig.ts";
import type { SubtitleSegment, VideoMetadata } from "../storage.ts";
import type { ApiTranscriptSegment, ScrapeCreatorsResponse } from "../types.ts";
import { formatTimestamp } from "../utils/date.ts";
import { createYouTubeWatchUrl } from "../utils/url.ts";

import {
	clearPendingTranscript,
	getCachedTranscript,
	getPendingTranscript,
	setCachedTranscript,
	setPendingTranscript,
} from "./cache.ts";
import { fetchTranscriptFromChromeTab } from "./chromeTab.ts";
import {
	createEmptyScrapeCreatorsResponse,
	fetchTranscriptFromScrapeCreators,
} from "./scrapeCreators.ts";
import { fetchTranscriptFromSupadata } from "./supadata.ts";

export { clearTranscriptCache, getCachedTranscript } from "./cache.ts";
export type TranscriptFetchContext = {
	scrapeCreatorsApiKey: string | null;
	supadataApiKey: string | null;
	transcriptProviderPreference: TranscriptProviderPreference;
	tabId?: number;
};
export { getPendingTranscript } from "./cache.ts";

const transcriptFetchContexts = new Map<
	string,
	{ ownerId: string; context: TranscriptFetchContext }
>();

export function setTranscriptFetchContext(
	videoId: string,
	ownerId: string,
	context: TranscriptFetchContext,
): void {
	transcriptFetchContexts.set(videoId, { ownerId, context });
}

export function clearTranscriptFetchContext(
	videoId: string,
	ownerId: string,
): void {
	const current = transcriptFetchContexts.get(videoId);
	if (current?.ownerId !== ownerId) return;
	transcriptFetchContexts.delete(videoId);
}

export function toSubtitleSegments(
	transcript: ApiTranscriptSegment[],
): SubtitleSegment[] {
	return transcript.map((segment) => ({
		text: segment.text,
		startTime: segment.startMs,
		endTime: segment.endMs,
		startTimeText: segment.startTimeText || formatTimestamp(segment.startMs),
	}));
}

export function extractVideoInfo(
	data: ScrapeCreatorsResponse,
	videoId: string,
): VideoMetadata {
	return {
		url: data.url || createYouTubeWatchUrl(videoId),
		title: data.title || null,
		thumbnail: data.thumbnail || null,
		author: data.channel?.title || null,
		duration: data.durationFormatted || null,
		uploadDate: data.publishDate || null,
		viewCount: data.viewCountInt ?? null,
		likeCount: data.likeCountInt ?? null,
		description: data.description || null,
	};
}

export function getTranscriptText(transcript: ApiTranscriptSegment[]): string {
	return transcript.map((segment) => segment.text).join(" ");
}

export async function fetchTranscript(
	videoId: string,
	retries = 2,
	context?: TranscriptFetchContext,
): Promise<ScrapeCreatorsResponse | null> {
	const cached = getCachedTranscript(videoId);
	if (cached) return cached;

	const pending = getPendingTranscript(videoId);
	if (pending) return pending;

	const scopedContext =
		context ?? transcriptFetchContexts.get(videoId)?.context;
	const scrapeCreatorsKey =
		scopedContext?.scrapeCreatorsApiKey ?? globalScrapeCreatorsKey;
	const supadataKey = scopedContext?.supadataApiKey ?? globalSupadataKey;
	const preference =
		scopedContext?.transcriptProviderPreference ??
		globalTranscriptProviderPreference;
	const tabId = scopedContext?.tabId;

	if (preference !== "chromeTab" && !scrapeCreatorsKey && !supadataKey) {
		console.error("No transcript API keys configured");
		return null;
	}

	const fetchPromise = (async () => {
		const tryChromeTab = async () => {
			if (!tabId) {
				throw new Error(
					"Chrome Tab transcript provider requires an active YouTube watch tab.",
				);
			}
			const result = await fetchTranscriptFromChromeTab(videoId, tabId);
			setCachedTranscript(videoId, result);
			return result;
		};

		const tryScrapeCreators = async () => {
			if (!scrapeCreatorsKey) return null;
			const result = await fetchTranscriptFromScrapeCreators(
				videoId,
				scrapeCreatorsKey,
				retries,
			);
			if (result) setCachedTranscript(videoId, result);
			return result;
		};

		const trySupadata = async () => {
			if (!supadataKey) return null;
			const result = await fetchTranscriptFromSupadata(videoId, supadataKey);
			if (result) setCachedTranscript(videoId, result);
			return result;
		};

		if (preference === "chromeTab") {
			return tryChromeTab();
		}

		const first = preference === "supadata" ? trySupadata : tryScrapeCreators;
		const second = preference === "supadata" ? tryScrapeCreators : trySupadata;

		const result = (await first()) ?? (await second());
		if (result) return result;

		return createEmptyScrapeCreatorsResponse(videoId);
	})();

	setPendingTranscript(videoId, fetchPromise);
	try {
		return await fetchPromise;
	} finally {
		clearPendingTranscript(videoId);
	}
}
