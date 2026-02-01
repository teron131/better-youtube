/**
 * Summary Handler
 * Handles summary generation requests with caching and workflow orchestration
 */

import { MESSAGE_ACTIONS } from "@/core/constants";
import { globalGeminiKey, globalOpenRouterKey } from "@/core/runtimeConfig";
import { createYouTubeWatchUrl } from "@/core/utils/url";
import {
  StoredSummary,
  VideoMetadata,
  getSubtitles,
  getSummary,
  getVideoMetadata,
  saveSummary,
  saveVideoMetadata,
} from "@/core/storage";
import {
  parseOpenRouterSummary,
  summarizeGemini,
  summaryToMarkdown,
  type Summary,
} from "@/core/summarizer";
import { summarizeWorkflow } from "@/core/summarizer/captionSummarizer";
import {
  extractVideoInfo,
  fetchTranscript,
  getCachedTranscript,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";

// ============================================================================
// Types
// ============================================================================

type SummaryResult = {
  summary: Summary;
  quality?: any;
  summaryText?: string;
  iterations?: number;
  qualityScore?: number;
};

type SummaryProvider = "openrouter" | "gemini" | "auto";

/**
 * Resolve which provider to use based on requested provider and available API keys
 */
function resolveProvider(
  requestedProvider: SummaryProvider,
  geminiKey: string | null,
  openRouterKey: string | null,
): "gemini" | "openrouter" {
  if (requestedProvider === "auto") {
    return geminiKey ? "gemini" : "openrouter";
  }

  if (requestedProvider === "gemini") {
    return geminiKey ? "gemini" : openRouterKey ? "openrouter" : "gemini";
  }

  return openRouterKey ? "openrouter" : geminiKey ? "gemini" : "openrouter";
}

// ============================================================================
// Storage Resolution Helpers
// ============================================================================

/**
 * Check if cached summary exists and is still valid for the current request
 */
async function checkCachedSummary(
  videoId: string,
  modelSelection: string,
  targetLanguage: string,
  forceRegenerate: boolean,
): Promise<StoredSummary | null> {
  if (forceRegenerate) return null;
  const storedSummary = await getSummary(videoId);
  if (!storedSummary) return null;
  if (storedSummary.modelUsed !== modelSelection) return null;
  if (storedSummary.targetLanguage !== targetLanguage) return null;
  return storedSummary;
}

/**
 * Resolve transcript source (message → cache → stored → URL)
 */
async function getTranscriptSource(
  videoId: string,
  messageTranscript: string | undefined,
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
    return segmentsToText(cached.transcript);
  }

  const storedSubtitles = await getSubtitles(videoId);
  if (storedSubtitles?.length) {
    console.log(`Using stored subtitles for summary of ${videoId}`);
    return segmentsToText(storedSubtitles);
  }

  console.log(`No cached transcript for ${videoId}, will use URL.`);
  return createYouTubeWatchUrl(videoId);
}

/**
 * Resolve video info (stored → cache → fetch)
 */
async function getVideoInfo(videoId: string): Promise<VideoMetadata> {
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
  const data = await fetchTranscript(videoId);
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

// ============================================================================
// Broadcasting Helpers
// ============================================================================

/**
 * Broadcast stored summary result to sidepanel
 */
async function broadcastStoredSummary(
  videoId: string,
  storedSummary: StoredSummary,
  requestId?: string,
): Promise<void> {
  const videoInfo = await getVideoMetadata(videoId);

  const summary = storedSummary.summary as any;
  const summaryText = videoInfo ? summaryToMarkdown(summary, videoInfo) : "";

  sendRuntimeMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    requestId,
    summary: {
      summary,
      quality: storedSummary.quality ?? null,
      summaryText: summaryText,
      iterations: 0,
      qualityScore: 0,
    },
    videoInfo,
    transcript: null,
  });

  console.log(`Returned stored summary for video: ${videoId}`);
}

/**
 * Broadcast summary result to sidepanel and save to storage
 */
async function broadcastSummaryResult(
  videoId: string,
  result: SummaryResult,
  videoInfo: VideoMetadata,
  transcript_or_url: string,
  modelSelection: string,
  targetLanguage: string,
  requestId?: string,
): Promise<void> {
  // Save summary to storage
  await saveSummary(
    videoId,
    result.summary,
    modelSelection,
    targetLanguage,
    result.quality,
  );

  // Send result to sidepanel
  sendRuntimeMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    requestId,
    summary: result,
    videoInfo,
    transcript: transcript_or_url.startsWith("http") ? null : transcript_or_url,
  });

  console.log(`Summarization workflow completed for video: ${videoId}`);
}

// ============================================================================
// Utility Helpers
// ============================================================================

function segmentsToText(segments: Array<{ text: string }>): string {
  return segments.map((segment) => segment.text).join(" ");
}

function sendRuntimeMessage(payload: Record<string, unknown>): void {
  chrome.runtime.sendMessage(payload, () => {
    if (chrome.runtime.lastError) {
      // Ignore when no listeners exist.
    }
  });
}

// ============================================================================
// Main Handler
// ============================================================================

export async function handleGenerateSummary(
  message: ChromeMessage,
  ctx: {
    summaryRequests: Map<string, string>;
    pendingSummaryJobs: Map<string, Promise<void>>;
  },
  sendResponse: (response: any) => void,
): Promise<void> {
  const { summaryRequests, pendingSummaryJobs } = ctx;
  const {
    videoId,
    requestId,
    transcript: msgTranscript,
    modelSelection,
    qualityModel,
    refinerModel,
    targetLanguage,
    fastMode,
    forceRegenerate,
    summaryProvider,
  } = message as any;

  if (requestId) {
    summaryRequests.set(videoId, String(requestId));
  }

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const requestedProvider: SummaryProvider =
    summaryProvider === "gemini" || summaryProvider === "auto"
      ? summaryProvider
      : "openrouter";

  const providerForKey = requestedProvider;
  const jobKey = `${videoId}:${effectiveRequestId}:${providerForKey}:${modelSelection}:${targetLanguage}:${fastMode ? "fast" : "full"}`;

  if (pendingSummaryJobs.has(jobKey)) {
    await pendingSummaryJobs.get(jobKey);
    return;
  }

  const isLatest = () => {
    if (!effectiveRequestId) return true;
    return summaryRequests.get(videoId) === effectiveRequestId;
  };

  const job = (async () => {
    try {
      const geminiKey = globalGeminiKey;
      const openRouterKey = globalOpenRouterKey;

      const requestedProviderEnum: SummaryProvider =
        summaryProvider === "gemini" || summaryProvider === "auto"
          ? summaryProvider
          : "openrouter";

      const provider = resolveProvider(
        requestedProviderEnum,
        geminiKey,
        openRouterKey,
      );

      const modelUsedKey = `${provider}::${String(modelSelection)}`;

      const storedSummary = await checkCachedSummary(
        videoId,
        modelUsedKey,
        targetLanguage,
        forceRegenerate,
      );
      if (storedSummary) {
        if (!isLatest()) return;
        await broadcastStoredSummary(
          videoId,
          storedSummary,
          effectiveRequestId || undefined,
        );
        return;
      }

      const transcript_or_url = await getTranscriptSource(
        videoId,
        msgTranscript,
      );
      const videoInfo = await getVideoInfo(videoId);

      let result: SummaryResult;
      if (provider === "gemini") {
        const geminiModel = normalizeGeminiModel(String(modelSelection));
        const useTranscript = !transcript_or_url.startsWith("http");
        const gemini = useTranscript
          ? await summarizeGemini(
              {
                kind: "transcript",
                transcript: transcript_or_url,
                targetLanguage: targetLanguage,
              },
              { model: geminiModel },
            )
          : await summarizeGemini(
              {
                kind: "youtube_url",
                videoUrl: transcript_or_url,
                targetLanguage: targetLanguage,
              },
              { model: geminiModel },
            );

        const summary = gemini.summary;
        result = {
          summary,
          quality: null,
          iterations: 1,
          qualityScore: 0,
          summaryText: summaryToMarkdown(summary, videoInfo),
        };
      } else {
        if (!openRouterKey) throw new Error("OpenRouter API key missing");
        const workflow = await summarizeWorkflow({
          transcript_or_url,
          videoId,
          title: videoInfo?.title || undefined,
          description: videoInfo?.description || undefined,
          summaryModel: modelSelection,
          qualityModel: qualityModel || modelSelection,
          refinerModel: refinerModel,
          targetLanguage: targetLanguage,
          fastMode: fastMode,
        });

        const summary = parseOpenRouterSummary(workflow.summary);
        result = {
          summary,
          quality: workflow.quality,
          iterations: workflow.iterations,
          qualityScore: workflow.qualityScore,
          summaryText: summaryToMarkdown(summary, videoInfo),
        };
      }

      if (!isLatest()) return;

      await broadcastSummaryResult(
        videoId,
        result,
        videoInfo,
        transcript_or_url,
        modelUsedKey,
        targetLanguage,
        effectiveRequestId || undefined,
      );
    } catch (error) {
      console.error("Summary error:", error);
      chrome.runtime
        .sendMessage({
          action: MESSAGE_ACTIONS.SHOW_ERROR,
          error: String(error),
          requestId: effectiveRequestId || undefined,
          videoId,
        })
        .catch(() => {});
    }
  })();

  pendingSummaryJobs.set(jobKey, job);
  try {
    await job;
  } finally {
    pendingSummaryJobs.delete(jobKey);
  }
}

function normalizeGeminiModel(modelSelection: string): string {
  if (modelSelection.startsWith("google/"))
    return modelSelection.slice("google/".length);
  if (modelSelection.startsWith("gemini-")) return modelSelection;
  return "gemini-3-flash-preview";
}
