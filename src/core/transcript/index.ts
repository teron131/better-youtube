import type { SubtitleSegment, VideoMetadata } from "../storage.ts";
import type { ApiTranscriptSegment, TranscriptResponse } from "../types.ts";
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

export { clearTranscriptCache, getCachedTranscript } from "./cache.ts";
export type TranscriptFetchContext = {
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
	data: TranscriptResponse,
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

function resolveFetchContext(
	videoId: string,
	context?: TranscriptFetchContext,
): TranscriptFetchContext | undefined {
	return context ?? transcriptFetchContexts.get(videoId)?.context;
}

async function fetchTranscriptForTab(
	videoId: string,
	tabId: number | undefined,
	hasScopedContext: boolean,
): Promise<TranscriptResponse | null> {
	if (!tabId) {
		if (hasScopedContext) {
			throw new Error(
				"Chrome transcript extraction requires an active YouTube watch tab.",
			);
		}
		return null;
	}

	const result = await fetchTranscriptFromChromeTab(videoId, tabId);
	setCachedTranscript(videoId, result);
	return result;
}

export async function fetchTranscript(
	videoId: string,
	context?: TranscriptFetchContext,
): Promise<TranscriptResponse | null> {
	const cached = getCachedTranscript(videoId);
	if (cached) return cached;

	const scopedContext = resolveFetchContext(videoId, context);
	const tabId = scopedContext?.tabId;

	const pending = getPendingTranscript(videoId, tabId);
	if (pending) return pending;

	const fetchPromise = fetchTranscriptForTab(
		videoId,
		tabId,
		Boolean(scopedContext),
	);

	setPendingTranscript(videoId, fetchPromise, tabId);
	try {
		return await fetchPromise;
	} finally {
		clearPendingTranscript(videoId, tabId);
	}
}
