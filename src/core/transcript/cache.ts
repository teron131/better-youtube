/** Keeps default and explicitly selected transcript tracks isolated in runtime cache and pending work. */
import { TIMING } from "../constants.ts";
import type { TranscriptResponse } from "../types.ts";

const transcriptCache = new Map<string, { data: TranscriptResponse; timestamp: number }>();
const pendingTranscriptFetches = new Map<string, Promise<TranscriptResponse | null>>();

function buildTranscriptKey(videoId: string, captionTrackId?: string): string {
  return JSON.stringify([videoId, captionTrackId ?? null]);
}

function buildPendingTranscriptKey(
  videoId: string,
  tabId?: number,
  captionTrackId?: string,
): string {
  return JSON.stringify([videoId, tabId ?? null, captionTrackId ?? null]);
}

export function getCachedTranscript(
  videoId: string,
  captionTrackId?: string,
): TranscriptResponse | undefined {
  const cached = transcriptCache.get(buildTranscriptKey(videoId, captionTrackId));
  if (cached && Date.now() - cached.timestamp < TIMING.TRANSCRIPT_CACHE_TTL_MS) {
    return cached.data;
  }
  return undefined;
}

/** Default fetches also seed their exact track; explicit fetches never replace the default transcript. */
export function setCachedTranscript(
  videoId: string,
  data: TranscriptResponse,
  captionTrackId?: string,
): void {
  const cached = { data, timestamp: Date.now() };
  transcriptCache.set(buildTranscriptKey(videoId, captionTrackId), cached);
  if (data.selectedCaptionTrackId !== undefined) {
    transcriptCache.set(buildTranscriptKey(videoId, data.selectedCaptionTrackId), cached);
  }
}

export function clearTranscriptCache(videoId: string): void {
  for (const key of transcriptCache.keys()) {
    if (JSON.parse(key)[0] === videoId) transcriptCache.delete(key);
  }
}

export function getPendingTranscript(
  videoId: string,
  tabId?: number,
  captionTrackId?: string,
): Promise<TranscriptResponse | null> | undefined {
  return pendingTranscriptFetches.get(buildPendingTranscriptKey(videoId, tabId, captionTrackId));
}

export function setPendingTranscript(
  videoId: string,
  promise: Promise<TranscriptResponse | null>,
  tabId?: number,
  captionTrackId?: string,
): void {
  pendingTranscriptFetches.set(buildPendingTranscriptKey(videoId, tabId, captionTrackId), promise);
}

export function clearPendingTranscript(
  videoId: string,
  tabId?: number,
  captionTrackId?: string,
): void {
  pendingTranscriptFetches.delete(buildPendingTranscriptKey(videoId, tabId, captionTrackId));
}
