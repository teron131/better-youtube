/**
 * Owns transcript fetching, request deduplication, runtime caching, and conversion into shared video data contracts.
 */

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

export type TranscriptFetchContext = {
  tabId?: number;
  forceRefresh?: boolean;
};

export function toSubtitleSegments(transcript: ApiTranscriptSegment[]): SubtitleSegment[] {
  return transcript.map((segment) => ({
    text: segment.text,
    startTime: segment.startMs,
    endTime: segment.endMs,
    startTimeText: segment.startTimeText || formatTimestamp(segment.startMs),
  }));
}

export function extractVideoInfo(data: TranscriptResponse, videoId: string): VideoMetadata {
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

export function getTranscriptText(transcript: ReadonlyArray<{ text: string }>): string {
  return transcript.map((segment) => segment.text).join(" ");
}

async function fetchTranscriptForTab(
  videoId: string,
  tabId: number | undefined,
  hasScopedContext: boolean,
): Promise<TranscriptResponse | null> {
  if (!tabId) {
    if (hasScopedContext) {
      throw new Error("Chrome transcript extraction requires an active YouTube watch tab.");
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
  const scopedContext = context;
  const tabId = scopedContext?.tabId;
  const forceRefresh = scopedContext?.forceRefresh === true;

  if (!forceRefresh) {
    const cached = getCachedTranscript(videoId);
    if (cached) return cached;

    const pending = getPendingTranscript(videoId, tabId);
    if (pending) return pending;
  }

  const fetchPromise = fetchTranscriptForTab(videoId, tabId, Boolean(scopedContext));

  if (forceRefresh) {
    return fetchPromise;
  }

  setPendingTranscript(videoId, fetchPromise, tabId);
  try {
    return await fetchPromise;
  } finally {
    clearPendingTranscript(videoId, tabId);
  }
}
