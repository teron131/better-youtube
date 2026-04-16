import { TIMING } from "../constants.ts";
import type { TranscriptResponse } from "../types.ts";

const transcriptCache = new Map<
	string,
	{ data: TranscriptResponse; timestamp: number }
>();
const pendingTranscriptFetches = new Map<
	string,
	Promise<TranscriptResponse | null>
>();

function buildPendingTranscriptKey(videoId: string, tabId?: number): string {
	return typeof tabId === "number"
		? `${videoId}::tab:${tabId}`
		: `${videoId}::shared`;
}

export function getCachedTranscript(
	videoId: string,
): TranscriptResponse | undefined {
	const cached = transcriptCache.get(videoId);
	if (
		cached &&
		Date.now() - cached.timestamp < TIMING.TRANSCRIPT_CACHE_TTL_MS
	) {
		return cached.data;
	}
	return undefined;
}

export function setCachedTranscript(
	videoId: string,
	data: TranscriptResponse,
): void {
	transcriptCache.set(videoId, { data, timestamp: Date.now() });
}

export function clearTranscriptCache(videoId: string): void {
	transcriptCache.delete(videoId);
}

export function getPendingTranscript(
	videoId: string,
	tabId?: number,
): Promise<TranscriptResponse | null> | undefined {
	return pendingTranscriptFetches.get(
		buildPendingTranscriptKey(videoId, tabId),
	);
}

export function setPendingTranscript(
	videoId: string,
	promise: Promise<TranscriptResponse | null>,
	tabId?: number,
): void {
	pendingTranscriptFetches.set(
		buildPendingTranscriptKey(videoId, tabId),
		promise,
	);
}

export function clearPendingTranscript(videoId: string, tabId?: number): void {
	pendingTranscriptFetches.delete(buildPendingTranscriptKey(videoId, tabId));
}
