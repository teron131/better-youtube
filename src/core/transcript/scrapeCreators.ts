import { API_ENDPOINTS, TIMING } from "@/core/constants";
import type {
  RawTranscriptSegment,
  ScrapeCreatorsResponse,
} from "@/core/types";

function createVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function buildTranscriptRequestUrl(videoId: string): URL {
  const requestUrl = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
  requestUrl.searchParams.set("url", createVideoUrl(videoId));
  return requestUrl;
}

function normalizeApiResponse(
  data: ScrapeCreatorsResponse,
): ScrapeCreatorsResponse {
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

export function createEmptyScrapeCreatorsResponse(
  videoId: string,
): ScrapeCreatorsResponse {
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

export async function fetchTranscriptFromScrapeCreators(
  videoId: string,
  apiKey: string,
  retries: number,
): Promise<ScrapeCreatorsResponse | null> {
  const requestUrl = buildTranscriptRequestUrl(videoId);

  for (let i = 0; i <= retries; i++) {
    if (i > 0) {
      await delay(TIMING.RETRY_BACKOFF_MULTIPLIER_MS * i);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      TIMING.SCRAPE_API_TIMEOUT_MS,
    );

    try {
      const response = await fetch(requestUrl.toString(), {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        return normalizeApiResponse(await response.json());
      }

      if (response.status === 401 || response.status === 403) {
        console.warn("Scrape Creators API auth failed");
        return null;
      }

      console.warn(`Scrape Creators API error (attempt ${i + 1})`);
    } catch (error) {
      console.warn(`Scrape Creators fetch error (attempt ${i + 1}):`, error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}
