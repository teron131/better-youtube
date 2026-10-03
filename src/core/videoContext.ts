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
  getResponseTranscriptText,
  getTranscriptText,
  type TranscriptFetchContext,
} from "./transcript/index.ts";
import { createYouTubeWatchUrl } from "./utils/url.ts";

/**
 * Resolves summary transcript text (message → pending tab fetch → cache → stored → fetch).
 * Supplied text stays verbatim; a video without transcript text fails before any model call.
 */
export async function resolveTranscriptText(
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
    const pendingText = getResponseTranscriptText(await pending);
    if (pendingText) return pendingText;
  }

  const cachedText = getResponseTranscriptText(getCachedTranscript(videoId));
  if (cachedText) {
    console.log(`Using cached transcript for summary of ${videoId}`);
    return cachedText;
  }

  const storedSubtitles = await getSubtitles(videoId);
  if (storedSubtitles?.length) {
    console.log(`Using stored subtitles for summary of ${videoId}`);
    return getTranscriptText(storedSubtitles);
  }

  const fetchedText = getResponseTranscriptText(await fetchTranscript(videoId, fetchContext));
  if (fetchedText) {
    console.log(`Using fetched transcript for summary of ${videoId}`);
    return fetchedText;
  }

  throw new Error("No transcript found for this video.");
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
