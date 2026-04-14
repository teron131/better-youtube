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
): Promise<TranscriptResponse | null> | undefined {
	return pendingTranscriptFetches.get(videoId);
}

export function setPendingTranscript(
	videoId: string,
	promise: Promise<TranscriptResponse | null>,
): void {
	pendingTranscriptFetches.set(videoId, promise);
}

export function clearPendingTranscript(videoId: string): void {
	pendingTranscriptFetches.delete(videoId);
}
