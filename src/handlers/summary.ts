/**
 * Summary Handler
 * Handles summary generation requests with caching and workflow orchestration
 */

import { MESSAGE_ACTIONS } from "@/core/constants";
import {
  globalGeminiKey,
  globalOpenRouterKey,
  globalScrapeCreatorsKey,
  globalSummarizerMode,
  globalSummarizerProvider,
  globalSupadataKey,
  globalTranscriptProviderPreference,
} from "@/core/runtimeConfig";
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
  summarizeWorkflow,
  summaryToMarkdown,
  type Summary,
} from "@/core/summarizer";
import {
  extractVideoInfo,
  fetchTranscript,
  getCachedTranscript,
  getTranscriptText,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import { createYouTubeWatchUrl } from "@/core/utils/url";
import {
  isGeminiModelSelection,
  resolveSummarizationRoute,
} from "@/core/workRouter";

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
type SummarizerMode = "native" | "react" | "fast";

type ProviderPref = "auto" | "gemini" | "openrouter";

function normalizeProviderPreference(input: {
  summaryProvider?: unknown;
  summarizerProvider?: unknown;
  globalProvider: ProviderPref;
}): ProviderPref {
  const { summaryProvider, summarizerProvider, globalProvider } = input;

  if (summarizerProvider === "gemini" || summarizerProvider === "openrouter") {
    return summarizerProvider;
  }

  if (summaryProvider === "gemini") return "gemini";
  if (summaryProvider === "openrouter") return "openrouter";
  if (summaryProvider === "auto") return "auto";

  return globalProvider;
}

function normalizeModePreference(input: {
  summarizerMode?: unknown;
  fastMode?: unknown;
  globalMode: SummarizerMode;
}): SummarizerMode {
  const { summarizerMode, fastMode, globalMode } = input;

  if (
    summarizerMode === "native" ||
    summarizerMode === "react" ||
    summarizerMode === "fast"
  ) {
    return summarizerMode;
  }

  if (fastMode === true) return "fast";
  if (fastMode === false) return "react";
  return globalMode;
}

function logSummaryConfig(payload: {
  videoId: string;
  requestId: string;
  modelSelection: string;
  targetLanguage: string;
  providerPref: ProviderPref;
  modePref: SummarizerMode;
  transcriptProviderPreference: string;
  resolvedProvider: string;
  desiredOpenRouterMode: "react" | "fast";
  msgHasTranscript: boolean;
}) {
  console.log(
    "[summary] config",
    JSON.stringify(
      {
        videoId: payload.videoId,
        requestId: payload.requestId,
        modelSelection: payload.modelSelection,
        targetLanguage: payload.targetLanguage,
        providerPref: payload.providerPref,
        modePref: payload.modePref,
        transcriptProviderPreference: payload.transcriptProviderPreference,
        desiredOpenRouterMode: payload.desiredOpenRouterMode,
        resolvedProvider: payload.resolvedProvider,
        msgHasTranscript: payload.msgHasTranscript,
        hasKeys: {
          gemini: Boolean(globalGeminiKey),
          openrouter: Boolean(globalOpenRouterKey),
          scrapeCreators: Boolean(globalScrapeCreatorsKey),
          supadata: Boolean(globalSupadataKey),
        },
      },
      null,
      0,
    ),
  );
}

// ============================================================================
// Storage Resolution Helpers
// ============================================================================

/**
 * Check if cached summary exists and is still valid for the current request
 */
async function checkCachedSummary(
  videoId: string,
  modelUsed: string,
  targetLanguage: string,
  forceRegenerate: boolean,
): Promise<StoredSummary | null> {
  if (forceRegenerate) return null;
  const storedSummary = await getSummary(videoId);
  if (!storedSummary) return null;
  if (storedSummary.modelUsed !== modelUsed) return null;
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

  const provider = storedSummary.modelUsed?.startsWith("gemini::")
    ? "gemini"
    : storedSummary.modelUsed?.startsWith("openrouter::")
      ? "openrouter"
      : undefined;

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
    provider,
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
  provider: "openrouter" | "gemini",
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
    provider,
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
    summarizerMode,
    summarizerProvider,
  } = message as any;

  if (requestId) {
    summaryRequests.set(videoId, String(requestId));
  }

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const providerPref = normalizeProviderPreference({
    summarizerProvider,
    summaryProvider,
    globalProvider: globalSummarizerProvider,
  });

  const modePref = normalizeModePreference({
    summarizerMode,
    fastMode,
    globalMode: globalSummarizerMode,
  });

  const desiredOpenRouterMode = modePref === "fast" ? "fast" : "react";

  const providerForKey = `${providerPref}:${modePref}`;
  const jobKey = `${videoId}:${effectiveRequestId}:${providerForKey}:${modelSelection}:${targetLanguage}`;

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

      const { provider } = resolveSummarizationRoute({
        providerPreference: providerPref,
        modePreference: modePref,
        modelSelection: String(modelSelection),
        hasGeminiKey: Boolean(geminiKey),
        hasOpenRouterKey: Boolean(openRouterKey),
      });

      logSummaryConfig({
        videoId,
        requestId: effectiveRequestId,
        modelSelection: String(modelSelection),
        targetLanguage: String(targetLanguage),
        providerPref,
        modePref,
        transcriptProviderPreference: String(
          globalTranscriptProviderPreference,
        ),
        resolvedProvider: provider,
        desiredOpenRouterMode,
        msgHasTranscript: Boolean(msgTranscript),
      });

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

      // Lazy resolution: Gemini can use URL directly; OpenRouter needs transcript_or_url.
      const getVideoInfoLazy = async () => getVideoInfo(videoId);
      const getOpenRouterSourceLazy = async () => {
        const transcript_or_url = await getTranscriptSource(
          videoId,
          msgTranscript,
        );
        if (!transcript_or_url.startsWith("http")) return transcript_or_url;

        const fetched = await fetchTranscript(videoId);
        if (!fetched) return transcript_or_url;

        const transcriptOnlyText =
          typeof (fetched as any).transcript_only_text === "string"
            ? String((fetched as any).transcript_only_text)
            : "";
        const text =
          transcriptOnlyText || getTranscriptText(fetched.transcript ?? []);
        return text.trim() ? text : transcript_or_url;
      };

      let result: SummaryResult;
      const tryGemini = async () => {
        if (!geminiKey) throw new Error("Gemini API key missing");
        const videoInfo = await getVideoInfoLazy();
        const geminiModel = normalizeGeminiModel(String(modelSelection));

        const gemini = msgTranscript
          ? await summarizeGemini(
              {
                kind: "transcript",
                transcript: String(msgTranscript),
                targetLanguage: targetLanguage,
              },
              { model: geminiModel },
            )
          : await summarizeGemini(
              {
                kind: "youtube_url",
                videoUrl: createYouTubeWatchUrl(videoId),
                targetLanguage: targetLanguage,
              },
              { model: geminiModel },
            );

        const summary = gemini.summary;
        return {
          summary,
          quality: null,
          iterations: 1,
          qualityScore: 0,
          summaryText: summaryToMarkdown(summary, videoInfo),
        };
      };

      const tryOpenRouter = async () => {
        if (!openRouterKey) throw new Error("OpenRouter API key missing");
        const transcript_or_url = await getOpenRouterSourceLazy();
        const videoInfo = await getVideoInfoLazy();
        const workflow = await summarizeWorkflow({
          transcript_or_url,
          videoId,
          title: videoInfo?.title || undefined,
          description: videoInfo?.description || undefined,
          summaryModel: modelSelection,
          qualityModel: qualityModel || modelSelection,
          refinerModel: refinerModel,
          targetLanguage: targetLanguage,
          fastMode: desiredOpenRouterMode === "fast",
        });

        const summary = parseOpenRouterSummary(workflow.summary);
        return {
          summary,
          quality: workflow.quality,
          iterations: workflow.iterations,
          qualityScore: workflow.qualityScore,
          summaryText: summaryToMarkdown(summary, videoInfo),
        };
      };

      let finalProvider = provider;
      try {
        if (provider === "gemini") {
          if (
            modePref !== "native" &&
            !isGeminiModelSelection(String(modelSelection))
          ) {
            throw new Error(
              "Selected model is not a Gemini model; cannot use Gemini provider",
            );
          }
          result = await tryGemini();
        } else {
          result = await tryOpenRouter();
        }
      } catch (error) {
        console.warn("[summary] primary failed, trying fallback", {
          provider,
          videoId,
          requestId: effectiveRequestId,
          error: String(error),
        });
        if (provider === "gemini" && openRouterKey) {
          result = await tryOpenRouter();
          finalProvider = "openrouter";
        } else if (provider === "openrouter" && geminiKey) {
          result = await tryGemini();
          finalProvider = "gemini";
        } else {
          throw error;
        }
      }

      if (!isLatest()) return;

      const videoInfo = await getVideoInfoLazy();
      const transcript_or_url =
        finalProvider === "gemini" && !msgTranscript
          ? createYouTubeWatchUrl(videoId)
          : await getOpenRouterSourceLazy();
      await broadcastSummaryResult(
        videoId,
        result,
        videoInfo,
        transcript_or_url,
        `${finalProvider}::${String(modelSelection)}`,
        targetLanguage,
        finalProvider,
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
