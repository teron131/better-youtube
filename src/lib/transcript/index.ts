import { getScrapeCreatorsApiKey, getSupadataApiKey } from "@/lib/core/runtimeConfig";
import type { SubtitleSegment, VideoMetadata } from "@/lib/core/storage";
import type { ApiTranscriptSegment, ScrapeCreatorsResponse } from "@/lib/core/types";
import { formatTimestamp } from "@/lib/utils/date";

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
} from "./providers/scrapeCreators";
import { fetchTranscriptFromSupadata } from "./providers/supadata";

export { clearTranscriptCache, getCachedTranscript } from "./cache";

function createVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function convertToSubtitleSegments(transcript: ApiTranscriptSegment[]): SubtitleSegment[] {
  return transcript.map((segment) => ({
    text: segment.text,
    startTime: segment.startMs,
    endTime: segment.endMs,
    startTimeText: segment.startTimeText || formatTimestamp(segment.startMs),
  }));
}

export function extractVideoInfo(data: ScrapeCreatorsResponse, videoId: string): VideoMetadata {
  return {
    url: data.url || createVideoUrl(videoId),
    title: data.title || null,
    thumbnail: data.thumbnail || null,
    author: data.channel?.title || null,
    duration: data.durationFormatted || null,
    upload_date: data.publishDate || null,
    view_count: data.viewCountInt ?? null,
    like_count: data.likeCountInt ?? null,
    description: data.description || null,
  };
}

export function getTranscriptText(transcript: ApiTranscriptSegment[]): string {
  return transcript.map((segment) => segment.text).join(" ");
}

export async function fetchTranscript(videoId: string, retries = 2): Promise<ScrapeCreatorsResponse | null> {
  const cached = getCachedTranscript(videoId);
  if (cached) return cached;

  const pending = getPendingTranscript(videoId);
  if (pending) return pending;

  const [scrapeCreatorsKey, supadataKey] = await Promise.all([
    getScrapeCreatorsApiKey(),
    getSupadataApiKey(),
  ]);

  if (!scrapeCreatorsKey && !supadataKey) {
    console.error("No transcript API keys configured");
    return null;
  }

  const fetchPromise = (async () => {
    if (scrapeCreatorsKey) {
      const result = await fetchTranscriptFromScrapeCreators(videoId, scrapeCreatorsKey, retries);
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
