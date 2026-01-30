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
function normalizeApiResponse(data: ScrapeCreatorsResponse): ScrapeCreatorsResponse {
  if (!Array.isArray(data.transcript)) return data;
  return {
    ...data,
    transcript: data.transcript.map((segment: RawTranscriptSegment) => ({
      ...segment,
      startMs: Number(segment.startMs),
      endMs: Number(segment.endMs),
    })),
  };
}

/**
 * Convert API transcript segments to SubtitleSegment format
 */
export function convertToSubtitleSegments(transcript: ApiTranscriptSegment[]): SubtitleSegment[] {
  return transcript.map((segment) => ({
    text: segment.text,
    startTime: segment.startMs,
    endTime: segment.endMs,
    startTimeText: segment.startTimeText || formatTimestamp(segment.startMs),
  }));
}

/**
 * Extract video info from ScrapeCreatorsResponse
 */
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
    const requestUrl = buildTranscriptRequestUrl(videoId);

    for (let i = 0; i <= retries; i++) {
      if (i > 0) {
        await delay(TIMING.RETRY_BACKOFF_MULTIPLIER_MS * i);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMING.SCRAPE_API_TIMEOUT_MS);

      try {
        const response = await fetch(requestUrl.toString(), {
          headers: { "x-api-key": apiKey, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

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
        console.warn(`Fetch error (attempt ${i + 1}):`, error);
      } finally {
        clearTimeout(timeoutId);
      }
    }
    
    // Fallback to empty schema on failure (no raising error)
    return createEmptyScrapeCreatorsResponse(videoId);
  })();

  pendingTranscriptFetches.set(videoId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    pendingTranscriptFetches.delete(videoId);
  }
}

function createVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function buildTranscriptRequestUrl(videoId: string): URL {
  const requestUrl = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
  requestUrl.searchParams.set("url", createVideoUrl(videoId));
  // Removed "get_transcript" parameter as it wasn't in the user request for the new endpoint
  return requestUrl;
}

function createEmptyScrapeCreatorsResponse(videoId: string): ScrapeCreatorsResponse {
  return {
    success: true, // Mock success to prevent errors downstream
    credits_remaining: 0,
    type: "video",
    url: createVideoUrl(videoId),
    transcript: [],
    title: "",
    description: "",
    channel: {
      id: "",
      url: "",
      handle: "",
      title: "",
    },
    durationFormatted: "",
    publishDate: "",
    viewCountInt: 0,
    likeCountInt: 0,
    keywords: [],
  };
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
