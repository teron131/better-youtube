/** Rebuilds sidepanel video state from persisted summaries, metadata, and subtitles. */

import type { VideoProcessingState } from "@ui/hooks/use-video-processing";

import {
  getCaptionState,
  getSubtitles,
  getSummary,
  getVideoMetadata,
  VideoStorageKeys,
} from "@/core/storage";
import { extractVideoId } from "@/core/utils/url";

export type CachedVideoState = Partial<VideoProcessingState>;

export const EMPTY_VIDEO_STATE: CachedVideoState = {
  summaryResult: null,
  scrapedVideoInfo: null,
  scrapedTranscript: null,
  captionState: null,
  captionSegments: [],
  isLoading: false,
  error: null,
};

export function isVideoInfoForVideo(
  videoInfo: VideoProcessingState["scrapedVideoInfo"] | undefined,
  videoId: string | null,
): boolean {
  if (!videoInfo || !videoId) return false;
  return extractVideoId(videoInfo.url) === videoId;
}

/** Null when nothing is stored; source captions still awaiting English translation are withheld so they never show as the transcript. */
export async function loadCachedVideoState(videoId: string): Promise<CachedVideoState | null> {
  const [storedSummary, storedVideoInfo, storedSubtitles, captionState] = await Promise.all([
    getSummary(videoId),
    getVideoMetadata(videoId),
    getSubtitles(videoId),
    getCaptionState(videoId),
  ]);

  const translationPending = captionState?.translationRequired && captionState.status !== "refined";
  const captionSegments = translationPending ? [] : (storedSubtitles ?? []);
  const transcript = captionSegments.length
    ? captionSegments.map((segment) => segment.text).join(" ")
    : null;
  if (!storedSummary && !storedVideoInfo && !transcript) {
    return null;
  }

  return {
    ...EMPTY_VIDEO_STATE,
    summaryResult: storedSummary
      ? {
          success: true,
          summary: storedSummary.summary,
          videoInfo: storedVideoInfo ?? undefined,
          transcript: transcript ?? undefined,
        }
      : null,
    scrapedVideoInfo: storedVideoInfo ?? null,
    scrapedTranscript: transcript ?? null,
    captionState,
    captionSegments,
  };
}

export function getTrackedStorageKeys(videoId: string): Set<string> {
  return new Set([
    VideoStorageKeys.subtitles(videoId),
    VideoStorageKeys.captions(videoId),
    VideoStorageKeys.metadata(videoId),
    VideoStorageKeys.summary(videoId),
  ]);
}
