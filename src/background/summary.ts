/// <reference types="chrome" />

/** Handles summary requests: deduplicates workloads, reuses matching saved summaries, and publishes results. */

import type { AppConfig } from "@/core/config";
import { MESSAGE_ACTIONS } from "@/core/constants";
import {
  getSummary,
  getVideoMetadata,
  saveSummary,
  type StoredSummary,
  type VideoMetadata,
} from "@/core/storage";
import type { TranscriptFetchContext } from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import { resolveSummarizationRoute } from "@/core/workRouter";

import { generateSummary } from "./summaryGeneration";
import type { VideoWorkloadLifecycle, VideoWorkloadRun } from "./workloads";

type ProviderPref = AppConfig["summarizerProvider"];

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

  sendRuntimeMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    requestId,
    summary: storedSummary.summary,
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
  summary: string,
  videoInfo: VideoMetadata,
  transcript: string | null,
  modelUsed: string,
  targetLanguage: string,
  requestId?: string,
  signal?: AbortSignal,
): Promise<void> {
  await saveSummary(videoId, summary, modelUsed, targetLanguage, signal);
  signal?.throwIfAborted();

  sendRuntimeMessage({
    action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
    videoId,
    requestId,
    summary,
    videoInfo,
    transcript,
  });

  console.log(`Summarization workflow completed for video: ${videoId}`);
}

// ============================================================================
// Utility Helpers
// ============================================================================

function sendRuntimeMessage(payload: Record<string, unknown>): void {
  chrome.runtime.sendMessage(payload, () => {
    if (chrome.runtime.lastError) {
      // Ignore when no listeners exist.
    }
  });
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function buildSummaryWorkloadKey(input: {
  videoId: string;
  providerPref: ProviderPref;
  modelSelection: unknown;
  targetLanguage: unknown;
  forceRegenerate: unknown;
  transcript: unknown;
}): string {
  const providerForKey = input.providerPref;
  const transcriptFingerprint =
    typeof input.transcript === "string" ? hashString(input.transcript) : "none";

  return (
    `${input.videoId}:${providerForKey}:${String(input.modelSelection)}:${String(input.targetLanguage)}:` +
    `${input.forceRegenerate === true ? "force" : "normal"}:${transcriptFingerprint}`
  );
}

// ============================================================================
// Main Handler
// ============================================================================

interface SummaryMessage extends ChromeMessage {
  videoId: string;
  requestId?: string;
  transcript?: string;
  modelSelection?: string;
  targetLanguage?: string;
  forceRegenerate?: boolean;
  summarizerProvider?: string;
}

export async function handleGenerateSummary(
  message: ChromeMessage,
  ctx: {
    summaryWorkloads: VideoWorkloadLifecycle;
    config: AppConfig;
    tabId?: number;
  },
  sendResponse: (response: unknown) => void,
): Promise<void> {
  const { summaryWorkloads, config, tabId } = ctx;
  const {
    videoId,
    requestId,
    transcript: msgTranscript,
    modelSelection,
    targetLanguage,
    forceRegenerate,
    summarizerProvider,
  } = message as unknown as SummaryMessage;
  const transcriptFetchContext: TranscriptFetchContext = { tabId };
  const selectedModel = modelSelection || config.summarizerModel;

  sendResponse({ status: "processing" });

  const providerPref: ProviderPref =
    summarizerProvider === "gemini" || summarizerProvider === "llm"
      ? summarizerProvider
      : config.summarizerProvider;

  const workloadKey = buildSummaryWorkloadKey({
    videoId,
    providerPref,
    modelSelection: selectedModel,
    targetLanguage,
    forceRegenerate,
    transcript: msgTranscript,
  });

  const run = summaryWorkloads.begin({
    videoId,
    requestId,
    workloadKey,
  });

  await run.runOrJoin(
    () =>
      runSummaryJob({
        videoId,
        msgTranscript,
        modelSelection: selectedModel,
        targetLanguage,
        forceRegenerate,
        config,
        providerPref,
        transcriptFetchContext,
        run,
      }),
    () => {
      console.log("[summary] dedupe join existing workload", {
        videoId,
        requestId: run.effectiveRequestId,
        workloadKey,
      });
    },
  );
}

/**
 * Runs one normalized summary generation job behind the lifecycle interface.
 */
async function runSummaryJob(input: {
  videoId: string;
  msgTranscript: string | undefined;
  modelSelection: string;
  targetLanguage: string | undefined;
  forceRegenerate: boolean | undefined;
  config: AppConfig;
  providerPref: ProviderPref;
  transcriptFetchContext: TranscriptFetchContext;
  run: VideoWorkloadRun;
}): Promise<void> {
  const {
    videoId,
    msgTranscript,
    modelSelection,
    targetLanguage,
    forceRegenerate,
    config,
    providerPref,
    transcriptFetchContext,
    run,
  } = input;

  try {
    run.signal.throwIfAborted();
    const geminiKey = config.geminiApiKey;
    const llmKey = config.llmApiKey;

    const { provider } = resolveSummarizationRoute({
      requestedProvider: providerPref,
      summarizerModel: modelSelection,
      hasGeminiKey: !!geminiKey,
      hasLlmKey: !!llmKey,
    });

    console.log(
      "[summary] config",
      JSON.stringify({
        videoId,
        requestId: run.effectiveRequestId,
        modelSelection,
        targetLanguage: String(targetLanguage),
        providerPref,
        resolvedProvider: provider,
        msgHasTranscript: Boolean(msgTranscript),
        hasKeys: {
          gemini: Boolean(geminiKey),
          llm: Boolean(llmKey),
        },
      }),
    );

    const modelUsedKey = `${provider}::${modelSelection}`;

    const storedSummary = await checkCachedSummary(
      videoId,
      modelUsedKey,
      targetLanguage,
      forceRegenerate,
    );
    if (storedSummary) {
      if (!run.isCurrent()) return;
      await broadcastStoredSummary(videoId, storedSummary, run.resolveRequestId());
      return;
    }

    const {
      summary,
      videoInfo,
      transcript,
      provider: finalProvider,
    } = await generateSummary(
      {
        videoId,
        msgTranscript,
        modelSelection,
        targetLanguage,
        provider,
        transcriptFetchContext,
        requestId: run.effectiveRequestId,
      },
      config,
      run.signal,
    );
    if (!run.isCurrent()) return;
    await broadcastSummaryResult(
      videoId,
      summary,
      videoInfo,
      transcript,
      `${finalProvider}::${modelSelection}`,
      targetLanguage,
      run.resolveRequestId(),
      run.signal,
    );
  } catch (error) {
    if (!run.isCurrent()) return;
    console.error("Summary error:", error);
    chrome.runtime
      .sendMessage({
        action: MESSAGE_ACTIONS.SHOW_ERROR,
        error: String(error),
        requestId: run.resolveRequestId(),
        videoId,
      })
      .catch(() => {});
  }
}
