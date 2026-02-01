import { API_ENDPOINTS } from "@/core/constants";
import { createYouTubeWatchUrl } from "@/core/utils/url";
import type {
  ApiTranscriptSegment,
  ScrapeCreatorsResponse,
  SupadataResponse,
} from "@/core/types";
import { formatTimestamp } from "@/core/utils/date";

function normalizeSupadataResponse(
  data: SupadataResponse,
  videoId: string,
): ScrapeCreatorsResponse {
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

export async function fetchTranscriptFromSupadata(
  videoId: string,
  apiKey: string,
): Promise<ScrapeCreatorsResponse | null> {
  const requestUrl = new URL(API_ENDPOINTS.SUPADATA);
  requestUrl.searchParams.set("url", createYouTubeWatchUrl(videoId));
  requestUrl.searchParams.set("lang", "en");
  requestUrl.searchParams.set("text", "true");

  try {
    const response = await fetch(requestUrl.toString(), {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(
        `Supadata API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data: SupadataResponse = await response.json();
    return normalizeSupadataResponse(data, videoId);
  } catch (error) {
    console.warn("Supadata fetch error:", error);
    return null;
  }
}
