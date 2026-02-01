import {
  globalScrapeCreatorsKey,
  globalSupadataKey,
} from "@/core/runtimeConfig";
import type { SubtitleSegment, VideoMetadata } from "@/core/storage";
import type {
  ApiTranscriptSegment,
  ScrapeCreatorsResponse,
} from "@/core/types";
import { formatTimestamp } from "@/core/utils/date";

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

function createVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
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
    url: data.url || createVideoUrl(videoId),
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
): Promise<ScrapeCreatorsResponse | null> {
  const cached = getCachedTranscript(videoId);
  if (cached) return cached;

  const pending = getPendingTranscript(videoId);
  if (pending) return pending;

  const scrapeCreatorsKey = globalScrapeCreatorsKey;
  const supadataKey = globalSupadataKey;

  if (!scrapeCreatorsKey && !supadataKey) {
    console.error("No transcript API keys configured");
    return null;
  }

  const fetchPromise = (async () => {
    if (scrapeCreatorsKey) {
      const result = await fetchTranscriptFromScrapeCreators(
        videoId,
        scrapeCreatorsKey,
        retries,
      );
      if (result) {
        setCachedTranscript(videoId, result);
        return result;
      }
    }

    if (supadataKey) {
      console.log("Falling back to Supadata API...");
      const result = await fetchTranscriptFromSupadata(videoId, supadataKey);
      if (result) {
        setCachedTranscript(videoId, result);
        return result;
      }
    }

    return createEmptyScrapeCreatorsResponse(videoId);
  })();

  setPendingTranscript(videoId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    clearPendingTranscript(videoId);
  }
}
