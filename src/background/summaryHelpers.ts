/**
 * Summary Handler Helpers
 * Extracted helper functions for handleGenerateSummary to improve readability
 */

import { MESSAGE_ACTIONS } from "@/lib/constants";
import { VideoMetadata, getStoredSubtitles, getStoredSummary, getStoredVideoMetadata, saveSummary, saveVideoMetadata } from "@/lib/storage";
import { extractVideoInfo, fetchTranscript, getCachedTranscript } from "@/lib/youtubeApi";

/**
 * Check if stored summary exists and is still valid for the current request
 */
export async function checkStoredSummary(
  videoId: string,
  modelSelection: string,
  targetLanguage: string,
  forceRegenerate: boolean
): Promise<any | null> {
  if (forceRegenerate) return null;
  const storedSummary = await getStoredSummary(videoId);
  if (storedSummary?.modelUsed === modelSelection && storedSummary.targetLanguage === targetLanguage) {
    return storedSummary;
  }
  return null;
}

/**
 * Broadcast stored summary result to sidepanel
 */
export async function broadcastStoredSummary(
  videoId: string,
  storedSummary: any
): Promise<void> {
  const videoInfo = await getStoredVideoMetadata(videoId);

  chrome.runtime.sendMessage(
    {
      action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
      videoId,
      summary: {
        summary: storedSummary.summary,
        quality: storedSummary.quality,
      },
      videoInfo,
      transcript: null,
    },
    () => {
      if (chrome.runtime.lastError) {
        // Ignore when no listeners exist.
      }
    }
  );

  console.log(`Returned stored summary for video: ${videoId}`);
}

/**
 * Resolve transcript source (message → cache → stored → URL)
 */
export async function resolveTranscriptSource(
  videoId: string,
  messageTranscript: string | undefined
): Promise<string> {
  if (messageTranscript) {
    console.log(`Using provided transcript for summary of ${videoId}`);
    return messageTranscript;
  }

  const cached = getCachedTranscript(videoId);
  if (cached?.transcript_only_text) {
    console.log(`Using cached transcript for summary of ${videoId}`);
    return cached.transcript_only_text;
  }
  if (cached?.transcript?.length) {
    console.log(`Using cached transcript segments for summary of ${videoId}`);
    return cached.transcript.map((s) => s.text).join(" ");
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
  scrapeCreatorsApiKey: string
): Promise<VideoMetadata> {
  const stored = await getStoredVideoMetadata(videoId);
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
  const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
  if (data) {
    const videoInfo = extractVideoInfo(data, videoId);
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
  // Save summary to storage
  await saveSummary(
    videoId,
    result.summary,
    modelSelection,
    targetLanguage,
    result.quality
  );

  // Send result to sidepanel
  chrome.runtime.sendMessage(
    {
      action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
      videoId,
      summary: result,
      videoInfo,
      transcript: transcript_or_url.startsWith("http") ? null : transcript_or_url,
    },
    () => {
      if (chrome.runtime.lastError) {
        // Ignore when no listeners exist.
      }
    }
  );

  console.log(`Summarization workflow completed for video: ${videoId}`);
}
