import type { VideoProcessingState } from "@ui/hooks/use-video-processing";

import {
  getSubtitles,
  getSubtitlesStorageKey,
  getSummary,
  getSummaryStorageKey,
  getVideoMetadata,
  getVideoMetadataStorageKey,
} from "@/core/storage";
import type { QualityData } from "@/core/types";
import { extractVideoId } from "@/core/utils/url";

export type CachedVideoState = Partial<VideoProcessingState>;

export const EMPTY_VIDEO_STATE: CachedVideoState = {
  summaryResult: null,
  scrapedVideoInfo: null,
  scrapedTranscript: null,
  currentStage: "",
  currentStep: 0,
  progressStates: [],
  isLoading: false,
  error: null,
};

export function segmentsToTranscript(segments?: Array<{ text: string }> | null): string | null {
  if (!segments?.length) return null;
  return segments.map((segment) => segment.text).join(" ");
}

export function isVideoInfoForVideo(
  videoInfo: VideoProcessingState["scrapedVideoInfo"] | undefined,
  videoId: string | null,
): boolean {
  if (!videoInfo || !videoId) return false;
  return extractVideoId(videoInfo.url) === videoId;
}

function resolveSummaryProvider(modelUsed?: string): "gemini" | "llm" | undefined {
  if (modelUsed?.startsWith("gemini::")) return "gemini";
  if (modelUsed?.startsWith("llm::")) return "llm";
  return undefined;
}

export function createTranscriptOnlyState(
  transcript: string | null,
  videoInfo: VideoProcessingState["scrapedVideoInfo"] = null,
): CachedVideoState {
  return {
    ...EMPTY_VIDEO_STATE,
    scrapedVideoInfo: videoInfo,
    scrapedTranscript: transcript,
    currentStage: transcript
      ? "Loaded cached transcript"
      : videoInfo
        ? "Loaded cached video info"
        : "",
  };
}

export async function loadCachedVideoState(videoId: string): Promise<CachedVideoState | null> {
  const [storedSummary, storedVideoInfo, storedSubtitles] = await Promise.all([
    getSummary(videoId),
    getVideoMetadata(videoId),
    getSubtitles(videoId),
  ]);

  const transcript = segmentsToTranscript(storedSubtitles);
  if (!storedSummary && !storedVideoInfo && !transcript) {
    return null;
  }

  if (!storedSummary) {
    return createTranscriptOnlyState(transcript, storedVideoInfo ?? null);
  }

  return {
    summaryResult: {
      success: true,
      summary: storedSummary.summary,
      quality: (storedSummary.quality as unknown as QualityData) ?? undefined,
      videoInfo: storedVideoInfo ?? undefined,
      transcript: transcript ?? undefined,
      provider: resolveSummaryProvider(storedSummary.modelUsed),
      totalTime: "cached",
      iterations: 0,
      chunksProcessed: 0,
    },
    scrapedVideoInfo: storedVideoInfo ?? null,
    scrapedTranscript: transcript ?? null,
    currentStage: "Loaded cached summary",
    currentStep: 4,
    progressStates: [],
    isLoading: false,
    error: null,
  };
}

export function getTrackedStorageKeys(videoId: string): Set<string> {
  return new Set([
    getSubtitlesStorageKey(videoId),
    getVideoMetadataStorageKey(videoId),
    getSummaryStorageKey(videoId),
  ]);
}
