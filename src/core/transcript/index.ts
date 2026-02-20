import {
  globalScrapeCreatorsKey,
  globalSupadataKey,
  globalTranscriptProviderPreference,
} from "@/core/runtimeConfig";
import type { SubtitleSegment, VideoMetadata } from "@/core/storage";
import type {
  ApiTranscriptSegment,
  ScrapeCreatorsResponse,
} from "@/core/types";
import { formatTimestamp } from "@/core/utils/date";
import { createYouTubeWatchUrl } from "@/core/utils/url";

import {
  clearPendingTranscript,
  getCachedTranscript,
  getPendingTranscript,
  setCachedTranscript,
  setPendingTranscript,
} from "./cache";
import {
  createEmptyScrapeCreatorsResponse,
  fetchTranscriptFromScrapeCreators,
} from "./scrapeCreators";
import { fetchTranscriptFromSupadata } from "./supadata";

export { clearTranscriptCache, getCachedTranscript } from "./cache";
export type TranscriptFetchContext = {
  scrapeCreatorsApiKey: string | null;
  supadataApiKey: string | null;
  transcriptProviderPreference: "scrapeCreators" | "supadata";
};
export { getPendingTranscript } from "./cache";

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

  if (!scrapeCreatorsKey && !supadataKey) {
    console.error("No transcript API keys configured");
    return null;
  }

  const fetchPromise = (async () => {
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
