import { TIMING } from "../constants.ts";
import type { ScrapeCreatorsResponse } from "../types.ts";

const transcriptCache = new Map<
	string,
	{ data: ScrapeCreatorsResponse; timestamp: number }
>();
const pendingTranscriptFetches = new Map<
	string,
	Promise<ScrapeCreatorsResponse | null>
>();

export function getCachedTranscript(
	videoId: string,
): ScrapeCreatorsResponse | undefined {
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
	data: ScrapeCreatorsResponse,
): void {
	transcriptCache.set(videoId, { data, timestamp: Date.now() });
}

export function clearTranscriptCache(videoId: string): void {
	transcriptCache.delete(videoId);
}

export function getPendingTranscript(
	videoId: string,
): Promise<ScrapeCreatorsResponse | null> | undefined {
	return pendingTranscriptFetches.get(videoId);
}

export function setPendingTranscript(
	videoId: string,
	promise: Promise<ScrapeCreatorsResponse | null>,
): void {
	pendingTranscriptFetches.set(videoId, promise);
}

export function clearPendingTranscript(videoId: string): void {
	pendingTranscriptFetches.delete(videoId);
}
