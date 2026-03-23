import { API_ENDPOINTS, TIMING } from "@/core/constants";
import { createYouTubeWatchUrl } from "@/core/utils/url";
import type {
  ApiTranscriptSegment,
  ScrapeCreatorsResponse,
} from "@/core/types";
import { formatTimestamp } from "@/core/utils/date";

interface SupadataTranscriptItem {
  lang?: string;
  text: string;
  offset: number;
  duration: number;
}

interface SupadataDirectResponse {
  content?: string | SupadataTranscriptItem[];
  lang?: string;
  availableLangs?: string[];
}

interface SupadataJobResponse {
  jobId?: string;
  status?: "queued" | "active" | "completed" | "failed";
  content?: string | SupadataTranscriptItem[];
  lang?: string;
  availableLangs?: string[];
  error?: { message?: string; details?: string } | string;
}

const SUPADATA_POLL_INTERVAL_MS = 1000;

function isTranscriptItem(value: unknown): value is SupadataTranscriptItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    "offset" in value &&
    "duration" in value
  );
}

function hasTranscriptArray(
  content: unknown,
): content is SupadataTranscriptItem[] {
  return Array.isArray(content) && content.every(isTranscriptItem);
}

function buildSupadataHeaders(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

function normalizeSupadataResponse(
  data: SupadataDirectResponse,
  videoId: string,
): ScrapeCreatorsResponse | null {
  if (!hasTranscriptArray(data.content)) {
    if (typeof data.content === "string") {
      return {
        success: true,
        credits_remaining: 0,
        type: "video",
        url: createYouTubeWatchUrl(videoId),
        transcript: [],
        transcript_only_text: data.content,
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
        videoId,
        language: data.lang,
      };
    }

    console.warn("Supadata response missing transcript chunks");
    return null;
  }

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
    url: createYouTubeWatchUrl(videoId),
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
    videoId,
    language: data.lang,
  };
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function pollSupadataJob(
  jobId: string,
  apiKey: string,
): Promise<SupadataDirectResponse | null> {
  const deadline = Date.now() + TIMING.PROCESSING_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(SUPADATA_POLL_INTERVAL_MS);

    try {
      const response = await fetch(`${API_ENDPOINTS.SUPADATA}/${jobId}`, {
        headers: buildSupadataHeaders(apiKey),
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn(
          `Supadata job status error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data: SupadataJobResponse = await response.json();

      if (data.status === "completed") {
        return data;
      }

      if (data.status === "failed") {
        console.warn("Supadata transcript job failed:", data.error);
        return null;
      }
    } catch (error) {
      console.warn("Supadata polling error:", error);
      return null;
    }
  }

  console.warn(`Supadata transcript job timed out for ${jobId}`);
  return null;
}

export async function fetchTranscriptFromSupadata(
  videoId: string,
  apiKey: string,
): Promise<ScrapeCreatorsResponse | null> {
  const requestUrl = new URL(API_ENDPOINTS.SUPADATA);
  requestUrl.searchParams.set("url", createYouTubeWatchUrl(videoId));
  requestUrl.searchParams.set("lang", "en");
  requestUrl.searchParams.set("text", "false");

  try {
    const response = await fetch(requestUrl.toString(), {
      headers: buildSupadataHeaders(apiKey),
      cache: "no-store",
    });

    if (response.status === 206) {
      console.warn("Supadata transcript unavailable for this video");
      return null;
    }

    if (!response.ok) {
      console.warn(
        `Supadata API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data: SupadataDirectResponse | SupadataJobResponse =
      await response.json();
    const resolvedData =
      "jobId" in data && typeof data.jobId === "string"
        ? await pollSupadataJob(data.jobId, apiKey)
        : data;

    if (!resolvedData) {
      return null;
    }

    return normalizeSupadataResponse(resolvedData, videoId);
  } catch (error) {
    console.warn("Supadata fetch error:", error);
    return null;
  }
}
