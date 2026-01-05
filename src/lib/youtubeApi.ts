
import { API_ENDPOINTS, TIMING } from "./constants";
import { SubtitleSegment, VideoMetadata } from "./storage";
import { formatTimestamp } from "./time";
import {
  ApiTranscriptSegment,
  RawTranscriptSegment,
  ScrapeCreatorsResponse
} from "./types";

// ============================================================================
// State & Cache
// ============================================================================

const transcriptCache = new Map<string, { data: ScrapeCreatorsResponse; timestamp: number }>();
const pendingTranscriptFetches = new Map<string, Promise<ScrapeCreatorsResponse | null>>();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalizes raw API response to ensure numbers are numbers
 */
function normalizeApiResponse(data: any): ScrapeCreatorsResponse {
  if (data.transcript && Array.isArray(data.transcript)) {
    data.transcript = data.transcript.map((s: RawTranscriptSegment) => ({
      ...s,
      startMs: Number(s.startMs),
      endMs: Number(s.endMs),
    }));
  }
  return data as ScrapeCreatorsResponse;
}

/**
 * Convert API transcript segments to SubtitleSegment format
 */
export function convertToSubtitleSegments(transcript: ApiTranscriptSegment[]): SubtitleSegment[] {
  return transcript.map(s => ({
    text: s.text,
    startTime: s.startMs,
    endTime: s.endMs,
    startTimeText: s.startTimeText || formatTimestamp(s.startMs),
  }));
}

/**
 * Extract video info from ScrapeCreatorsResponse
 */
export function extractVideoInfo(data: ScrapeCreatorsResponse, videoId: string): VideoMetadata {
  return {
    url: data.url || `https://www.youtube.com/watch?v=${videoId}`,
    title: data.title || null,
    thumbnail: data.thumbnail || null,
    author: data.channel?.title || null,
    duration: data.durationFormatted || null,
    upload_date: data.publishDate || null,
    view_count: data.viewCountInt ?? null,
    like_count: data.likeCountInt ?? null,
  };
}

/**
 * Expose cache for resolving transcript sources
 */
export function getCachedTranscript(videoId: string): ScrapeCreatorsResponse | undefined {
  const cached = transcriptCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < TIMING.TRANSCRIPT_CACHE_TTL_MS) {
    return cached.data;
  }
  return undefined;
}

/**
 * Clear cache for a video (e.g. force regenerate)
 */
export function clearTranscriptCache(videoId: string): void {
  transcriptCache.delete(videoId);
}

// ============================================================================
// Main Fetch Logic
// ============================================================================

/**
 * Fetch video transcript using Scrape Creators API with deduplication, caching, and retries
 */
export async function fetchTranscript(
  videoId: string,
  apiKey: string,
  retries = 2
): Promise<ScrapeCreatorsResponse | null> {
  // Check cache
  const cachedData = getCachedTranscript(videoId);
  if (cachedData) {
    return cachedData;
  }

  // Check pending
  if (pendingTranscriptFetches.has(videoId)) {
    return pendingTranscriptFetches.get(videoId)!;
  }

  if (!apiKey?.trim()) {
    console.error("API key is missing or empty");
    return null;
  }

  const fetchPromise = (async () => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const requestUrl = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
    requestUrl.searchParams.set("url", youtubeUrl);
    requestUrl.searchParams.set("get_transcript", "true");

    for (let i = 0; i <= retries; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_BACKOFF_MULTIPLIER_MS * i));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMING.SCRAPE_API_TIMEOUT_MS);

      try {
        const response = await fetch(requestUrl.toString(), {
          headers: { "x-api-key": apiKey, "Accept": "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`API error (attempt ${i + 1}):`, errorText);
          if (response.status === 401 || response.status === 403) return null;
          continue;
        }

        const data = normalizeApiResponse(await response.json());
        transcriptCache.set(videoId, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        console.warn(`Fetch error (attempt ${i + 1}):`, error);
      }
    }
    return null;
  })();

  pendingTranscriptFetches.set(videoId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    pendingTranscriptFetches.delete(videoId);
  }
}
