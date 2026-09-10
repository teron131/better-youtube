/** Resolves summary transcripts and metadata using explicit tab context and established cache precedence. */

import {
  getSubtitles,
  getVideoMetadata,
  saveVideoMetadata,
  type VideoMetadata,
} from "./storage.ts";
import {
  extractVideoInfo,
  fetchTranscript,
  getCachedTranscript,
  getPendingTranscript,
  getTranscriptText,
  type TranscriptFetchContext,
} from "./transcript/index.ts";
import type { TranscriptResponse } from "./types.ts";
import { createYouTubeWatchUrl } from "./utils/url.ts";

/**
 * Resolve transcript source (message → cache → stored → URL)
 */
export async function getTranscriptSource(
  videoId: string,
  messageTranscript: string | undefined,
  fetchContext: TranscriptFetchContext,
): Promise<string> {
  if (messageTranscript) {
    console.log(`Using provided transcript for summary of ${videoId}`);
    return messageTranscript;
  }

  const pending = getPendingTranscript(videoId, fetchContext.tabId);
  if (pending) {
    console.log(`Waiting for pending transcript fetch for ${videoId}`);
    const fetched = await pending;
    const pendingText = toTranscriptText(fetched);
    if (pendingText) {
      return pendingText;
    }
  }

  const cached = getCachedTranscript(videoId);
  if (cached?.transcript_only_text) {
    console.log(`Using cached transcript for summary of ${videoId}`);
    return cached.transcript_only_text;
  }
  if (cached?.transcript?.length) {
    console.log(`Using cached transcript segments for summary of ${videoId}`);
    return getTranscriptText(cached.transcript);
  }

  const storedSubtitles = await getSubtitles(videoId);
  if (storedSubtitles?.length) {
    console.log(`Using stored subtitles for summary of ${videoId}`);
    return getTranscriptText(storedSubtitles);
  }

  const fetched = await fetchTranscript(videoId, fetchContext);
  const text = toTranscriptText(fetched);
  if (text) {
    console.log(`Using fetched transcript for summary of ${videoId}`);
    return text;
  }

  console.log(`No transcript text available for ${videoId}, will use URL.`);
  return createYouTubeWatchUrl(videoId);
}

/**
 * Resolve video info (stored → cache → fetch)
 */
export async function getVideoInfo(
  videoId: string,
  fetchContext: TranscriptFetchContext,
): Promise<VideoMetadata> {
  const stored = await getVideoMetadata(videoId);
  if (stored) {
    console.log(`Using stored video info for ${videoId}`);
    return stored;
  }

  const cached = getCachedTranscript(videoId);
  if (cached) {
    const videoInfo = extractVideoInfo(cached, videoId);
    console.log(`Using cached video info for ${videoId}`);
    return videoInfo;
  }

  console.log(`No stored/cached video info for ${videoId}, fetching...`);
  const data = await fetchTranscript(videoId, fetchContext);
  if (data) {
    const videoInfo = extractVideoInfo(data, videoId);
    await saveVideoMetadata(videoId, videoInfo);
    return videoInfo;
  }

  return {
    url: createYouTubeWatchUrl(videoId),
    title: null,
    thumbnail: null,
    author: null,
    duration: null,
    uploadDate: null,
    viewCount: null,
    likeCount: null,
  };
}

function toTranscriptText(data: TranscriptResponse | null): string | null {
  if (!data) return null;
  const transcriptOnlyText =
    typeof data.transcript_only_text === "string" ? data.transcript_only_text : "";
  const text = transcriptOnlyText || getTranscriptText(data.transcript ?? []);
  return text.trim() ? text : null;
}
