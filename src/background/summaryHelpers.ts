/**
 * Summary Handler Helpers
 * Extracted helper functions for handleGenerateSummary to improve readability
 */

import { MESSAGE_ACTIONS } from "@/lib/constants";
import { VideoMetadata, getStoredAnalysis, getStoredSubtitles, getStoredVideoMetadata, saveAnalysis, saveVideoMetadata } from "@/lib/storage";
import type { ScrapeCreatorsResponse } from "./index";

/**
 * Check if stored analysis exists and is still valid for the current request
 */
export async function checkStoredAnalysis(
  videoId: string,
  modelSelection: string,
  targetLanguage: string,
  forceRegenerate: boolean
): Promise<any | null> {
  if (forceRegenerate) return null;
  const storedAnalysis = await getStoredAnalysis(videoId);
  if (storedAnalysis?.modelUsed === modelSelection && storedAnalysis.targetLanguage === targetLanguage) {
    return storedAnalysis;
  }
  return null;
}

/**
 * Broadcast stored analysis result to sidepanel
 */
export async function broadcastStoredAnalysis(
  videoId: string,
  storedAnalysis: any
): Promise<void> {
  const videoInfo = await getStoredVideoMetadata(videoId);

  chrome.runtime.sendMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    summary: {
      analysis: storedAnalysis.analysis,
      quality: storedAnalysis.quality,
    },
    videoInfo,
    transcript: null,
  });

  console.log(`Returned stored analysis for video: ${videoId}`);
}

/**
 * Resolve transcript source (message → cache → stored → URL)
 */
export async function resolveTranscriptSource(
  videoId: string,
  messageTranscript: string | undefined,
  transcriptCache: Map<string, { data: ScrapeCreatorsResponse; timestamp: number }>
): Promise<string> {
  if (messageTranscript) {
    console.log(`Using provided transcript for summary of ${videoId}`);
    return messageTranscript;
  }

  const cached = transcriptCache.get(videoId);
  if (cached?.data.transcript_only_text) {
    console.log(`Using cached transcript for summary of ${videoId}`);
    return cached.data.transcript_only_text;
  }
  if (cached?.data.transcript?.length) {
    console.log(`Using cached transcript segments for summary of ${videoId}`);
    return cached.data.transcript.map((s) => s.text).join(" ");
  }

  const storedSubtitles = await getStoredSubtitles(videoId);
  if (storedSubtitles?.length) {
    console.log(`Using stored subtitles for summary of ${videoId}`);
    return storedSubtitles.map((s) => s.text).join(" ");
  }

  console.log(`No cached transcript for ${videoId}, will use URL.`);
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Resolve video info (stored → cache → fetch)
 */
export async function resolveVideoInfo(
  videoId: string,
  transcriptCache: Map<string, { data: ScrapeCreatorsResponse; timestamp: number }>,
  extractVideoInfoFn: (data: ScrapeCreatorsResponse, videoId: string) => VideoMetadata,
  fetchTranscriptFn: (videoId: string, apiKey: string) => Promise<ScrapeCreatorsResponse | null>,
  scrapeCreatorsApiKey: string
): Promise<VideoMetadata> {
  const stored = await getStoredVideoMetadata(videoId);
  if (stored) {
    console.log(`Using stored video info for ${videoId}`);
    return stored;
  }

  const cached = transcriptCache.get(videoId);
  if (cached) {
    const videoInfo = extractVideoInfoFn(cached.data, videoId);
    console.log(`Using cached video info for ${videoId}`);
    return videoInfo;
  }

  console.log(`No stored/cached video info for ${videoId}, fetching...`);
  const data = await fetchTranscriptFn(videoId, scrapeCreatorsApiKey);
  if (data) {
    const videoInfo = extractVideoInfoFn(data, videoId);
    await saveVideoMetadata(videoId, videoInfo);
    return videoInfo;
  }

  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: null,
    thumbnail: null,
    author: null,
    duration: null,
    upload_date: null,
    view_count: null,
    like_count: null,
  };
}

/**
 * Broadcast summary result to sidepanel and save to storage
 */
export async function broadcastSummaryResult(
  videoId: string,
  result: any,
  videoInfo: VideoMetadata,
  transcript_or_url: string,
  modelSelection: string,
  targetLanguage: string
): Promise<void> {
  // Save analysis to storage
  await saveAnalysis(
    videoId,
    result.analysis,
    modelSelection,
    targetLanguage,
    result.quality
  );

  // Send result to sidepanel
  chrome.runtime.sendMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    summary: result,
    videoInfo,
    transcript: transcript_or_url.startsWith("http") ? null : transcript_or_url,
  });

  console.log(`Summarization workflow completed for video: ${videoId}`);
}
