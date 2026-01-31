/**
 * Summary Handler
 * Handles summary generation requests with caching and workflow orchestration
 */

import type { ChromeMessage } from "@/core/utils/chrome";
import { MESSAGE_ACTIONS } from "@/core/constants";
import {
  StoredSummary,
  VideoMetadata,
  getStoredSubtitles,
  getStoredSummary,
  getStoredVideoMetadata,
  saveSummary,
  saveVideoMetadata,
} from "@/core/storage";
import {
  extractVideoInfo,
  fetchTranscript,
  getCachedTranscript,
} from "@/core/transcript";
import { executeSummarizationWorkflow } from "@/core/summarizer/captionSummarizer";
import {
  formatSimpleSummaryAsMarkdown,
  summarizeWithGeminiNative,
  toSimpleSummaryFromGemini,
  toSimpleSummaryFromOpenRouter,
  type SimpleSummary,
} from "@/core/summarizer";
import { getGeminiApiKey, getOpenRouterApiKey } from "@/core/runtimeConfig";

// ============================================================================
// Types
// ============================================================================

type SummaryResult = {
  summary: any;
  quality?: any;
  simple_summary?: SimpleSummary;
  summary_text?: string;
  iteration_count?: number;
  quality_score?: number;
};

type SummaryProvider = "openrouter" | "gemini" | "auto";

// ============================================================================
// Storage Resolution Helpers
// ============================================================================

/**
 * Check if stored summary exists and is still valid for the current request
 */
async function checkStoredSummary(
  videoId: string,
  modelSelection: string,
  targetLanguage: string,
  forceRegenerate: boolean,
): Promise<StoredSummary | null> {
  if (forceRegenerate) return null;
  const storedSummary = await getStoredSummary(videoId);
  if (!storedSummary) return null;
  if (storedSummary.modelUsed !== modelSelection) return null;
  if (storedSummary.targetLanguage !== targetLanguage) return null;
  return storedSummary;
}

/**
 * Resolve transcript source (message → cache → stored → URL)
 */
async function resolveTranscriptSource(
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

  const storedSubtitles = await getStoredSubtitles(videoId);
  if (storedSubtitles?.length) {
    console.log(`Using stored subtitles for summary of ${videoId}`);
    return segmentsToText(storedSubtitles);
  }

  console.log(`No cached transcript for ${videoId}, will use URL.`);
  return createVideoUrl(videoId);
}

/**
 * Resolve video info (stored → cache → fetch)
 */
async function resolveVideoInfo(videoId: string): Promise<VideoMetadata> {
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
  const data = await fetchTranscript(videoId);
  if (data) {
    const videoInfo = extractVideoInfo(data, videoId);
    await saveVideoMetadata(videoId, videoInfo);
    return videoInfo;
  }

  return {
    url: createVideoUrl(videoId),
    title: null,
    thumbnail: null,
    author: null,
    duration: null,
    upload_date: null,
    view_count: null,
    like_count: null,
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
  const videoInfo = await getStoredVideoMetadata(videoId);

  sendRuntimeMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    requestId,
    summary: {
      summary: storedSummary.summary,
      quality: storedSummary.quality,
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

function createVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

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
    latestSummaryRequestByVideo: Map<string, string>;
    pendingSummaryJobs: Map<string, Promise<void>>;
  },
  sendResponse: (response: any) => void,
): Promise<void> {
  const { latestSummaryRequestByVideo, pendingSummaryJobs } = ctx;
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
    latestSummaryRequestByVideo.set(videoId, String(requestId));
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
    return latestSummaryRequestByVideo.get(videoId) === effectiveRequestId;
  };

  const job = (async () => {
    try {
      const openRouterKey = await getOpenRouterApiKey();
      const geminiKey = await getGeminiApiKey();

      const resolvedProvider: Exclude<SummaryProvider, "auto"> =
        requestedProvider === "auto"
          ? geminiKey
            ? "gemini"
            : "openrouter"
          : requestedProvider;

      const provider =
        resolvedProvider === "gemini"
          ? geminiKey
            ? "gemini"
            : openRouterKey
              ? "openrouter"
              : "gemini"
          : openRouterKey
            ? "openrouter"
            : geminiKey
              ? "gemini"
              : "openrouter";

      const modelUsedKey = `${provider}::${String(modelSelection)}`;

      const storedSummary = await checkStoredSummary(
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

      const transcript_or_url = await resolveTranscriptSource(
        videoId,
        msgTranscript,
      );
      const videoInfo = await resolveVideoInfo(videoId);

      let result: SummaryResult;
      if (provider === "gemini") {
        const geminiModel = normalizeGeminiModel(String(modelSelection));
        const gemini = await summarizeWithGeminiNative(
          transcript_or_url.startsWith("http")
            ? {
                kind: "youtube_url",
                videoUrl: transcript_or_url,
                targetLanguage,
              }
            : {
                kind: "transcript",
                transcript: transcript_or_url,
                targetLanguage,
              },
          { model: geminiModel },
        );

        const simple = toSimpleSummaryFromGemini(gemini.analysis);
        const legacy = geminiToLegacySummary(simple, videoInfo, targetLanguage);

        result = {
          summary: legacy,
          quality: null,
          simple_summary: simple,
          iteration_count: 1,
          quality_score: 0,
          summary_text: formatSimpleSummaryAsMarkdown(simple, videoInfo),
        };
      } else {
        if (!openRouterKey) throw new Error("OpenRouter API key missing");
        const workflow = await executeSummarizationWorkflow({
          transcript_or_url,
          videoId,
          title: videoInfo?.title || undefined,
          description: videoInfo?.description || undefined,
          summary_model: modelSelection,
          quality_model: qualityModel || modelSelection,
          refiner_model: refinerModel,
          target_language: targetLanguage,
          fast_mode: fastMode,
        });

        const simple = toSimpleSummaryFromOpenRouter(workflow.summary);
        result = {
          ...workflow,
          simple_summary: simple,
          summary_text:
            typeof (workflow as any).summary_text === "string"
              ? (workflow as any).summary_text
              : formatSimpleSummaryAsMarkdown(simple, videoInfo),
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
  if (modelSelection.startsWith("google/")) return modelSelection.slice("google/".length);
  if (modelSelection.startsWith("gemini-")) return modelSelection;
  return "gemini-3-flash-preview";
}

function geminiToLegacySummary(
  simple: SimpleSummary,
  videoInfo: VideoMetadata,
  targetLanguage: string,
): any {
  return {
    title: videoInfo?.title || "",
    summary: simple.overallSummary,
    takeaways: [],
    chapters: simple.chapters.map((c) => ({
      header: c.title,
      summary: c.description,
      key_points: [],
    })),
    keywords: [],
    target_language: targetLanguage,
  };
}
