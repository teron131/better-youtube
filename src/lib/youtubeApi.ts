import { API_ENDPOINTS, STORAGE_KEYS, TIMING } from "./constants";
import { SubtitleSegment, VideoMetadata, getStorageValue } from "./storage";
import { formatTimestamp } from "./time";
import {
  ApiTranscriptSegment,
  RawTranscriptSegment,
  ScrapeCreatorsResponse,
  SupadataResponse
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
 * Converts Supadata response to ScrapeCreatorsResponse format
 */
function normalizeSupadataResponse(data: SupadataResponse, videoId: string): ScrapeCreatorsResponse {
  const transcript: ApiTranscriptSegment[] = data.content.map((item) => ({
    text: item.text,
    startMs: item.offset,
    endMs: item.offset + item.duration,
    startTimeText: formatTimestamp(item.offset),
  }));

  return {
    success: true,
    credits_remaining: 0,
    type: "video",
    url: createVideoUrl(videoId),
    transcript,
    title: "", // Metadata not provided by this specific endpoint
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
    videoId: videoId,
    language: data.lang,
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
 * Helper to extract full text from a transcript
 */
export function getTranscriptText(transcript: ApiTranscriptSegment[]): string {
  return transcript.map((segment) => segment.text).join(" ");
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
 * Fetch video transcript using Supadata API as a fallback
 */
async function fetchTranscriptSupadata(
  videoId: string,
  apiKey: string
): Promise<ScrapeCreatorsResponse | null> {
  const requestUrl = new URL(API_ENDPOINTS.SUPADATA);
  requestUrl.searchParams.set("url", createVideoUrl(videoId));
  requestUrl.searchParams.set("lang", "en");
  requestUrl.searchParams.set("text", "true");
  // requestUrl.searchParams.set("mode", "native"); // Optional, based on user curl example

  try {
    const response = await fetch(requestUrl.toString(), {
      headers: { 
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`Supadata API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: SupadataResponse = await response.json();
    return normalizeSupadataResponse(data, videoId);
  } catch (error) {
    console.warn("Supadata fetch error:", error);
    return null;
  }
}

/**
 * Fetch video transcript using Scrape Creators API with deduplication, caching, and retries
 */
export async function fetchTranscript(
  videoId: string,
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

  // Get API keys from storage
  const [apiKey, supadataApiKey] = await Promise.all([
    getStorageValue<string>(STORAGE_KEYS.SCRAPE_CREATORS_API_KEY),
    getStorageValue<string>(STORAGE_KEYS.SUPADATA_API_KEY),
  ]);

  if (!apiKey?.trim() && !supadataApiKey?.trim()) {
    console.error("No transcript API keys found in settings");
    return null;
  }

  // Primary API fetch
  const fetchPromise = (async () => {
    // 1. Try Scrape Creators API
    if (apiKey?.trim()) {
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

          if (response.ok) {
            const data = normalizeApiResponse(await response.json());
            transcriptCache.set(videoId, { data, timestamp: Date.now() });
            return data;
          }
          
          if (response.status === 401 || response.status === 403) {
             console.warn("Scrape Creators API auth failed");
             break; // Don't retry if auth fails
          }
          console.warn(`Scrape Creators API error (attempt ${i + 1})`);
        } catch (error) {
          console.warn(`Scrape Creators fetch error (attempt ${i + 1}):`, error);
        } finally {
          clearTimeout(timeoutId);
        }
      }
    }

    // 2. Fallback to Supadata API
    if (supadataApiKey?.trim()) {
      console.log("Falling back to Supadata API...");
      const supadataResult = await fetchTranscriptSupadata(videoId, supadataApiKey);
      if (supadataResult) {
        transcriptCache.set(videoId, { data: supadataResult, timestamp: Date.now() });
        return supadataResult;
      }
    }

    // 3. Fallback to empty schema on failure (no raising error)
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
