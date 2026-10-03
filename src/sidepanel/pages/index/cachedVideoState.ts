/** Rebuilds sidepanel video state from persisted summaries, metadata, and subtitles. */

import type { VideoProcessingState } from "@ui/hooks/use-video-processing";

import { getSubtitles, getSummary, getVideoMetadata, VideoStorageKeys } from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

export type CachedVideoState = Partial<VideoProcessingState>;

export const EMPTY_VIDEO_STATE: CachedVideoState = {
  summaryResult: null,
  scrapedVideoInfo: null,
  scrapedTranscript: null,
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

export function createTranscriptOnlyState(
  transcript: string | null,
  videoInfo: VideoProcessingState["scrapedVideoInfo"] = null,
): CachedVideoState {
  return {
    ...EMPTY_VIDEO_STATE,
    scrapedVideoInfo: videoInfo,
    scrapedTranscript: transcript,
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
      videoInfo: storedVideoInfo ?? undefined,
      transcript: transcript ?? undefined,
    },
    scrapedVideoInfo: storedVideoInfo ?? null,
    scrapedTranscript: transcript ?? null,
    isLoading: false,
    error: null,
  };
}

export function getTrackedStorageKeys(videoId: string): Set<string> {
  return new Set([
    VideoStorageKeys.subtitles(videoId),
    VideoStorageKeys.metadata(videoId),
    VideoStorageKeys.summary(videoId),
  ]);
}
