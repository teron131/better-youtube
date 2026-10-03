/// <reference types="chrome" />

/** Sidepanel messaging for summary and caption requests, including cancellation and result matching. */

import { loadConfig } from "@/core/config";
import { MESSAGE_ACTIONS, TIMING } from "@/core/constants";
import { createRequestId, type RequestId } from "@/core/requestId";
import type { ApiError, StreamingProcessingResult, VideoInfoResponse } from "@/core/types";
import { type ChromeMessage, getCurrentTab, sendChromeMessage } from "@/core/utils/chrome";
import { extractVideoId } from "@/core/utils/url";

async function performScrape(
  videoId: string,
  tabId?: number,
): Promise<VideoInfoResponse | undefined> {
  const result = await sendChromeMessage<{ status: string; videoInfo?: VideoInfoResponse }>({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
    videoId,
    tabId,
  });

  if (result.status !== "success") throw new Error("Failed to fetch video data");
  return result.videoInfo;
}

/** Normalizes optional video details while retaining zero counts and a fallback request URL. */
function normalizeVideoInfo(
  rawInfo: VideoInfoResponse | null | undefined,
  fallbackUrl: string,
): VideoInfoResponse {
  const vi: Partial<VideoInfoResponse> = rawInfo || {};
  return {
    url: vi.url || fallbackUrl,
    title: vi.title || null,
    thumbnail: vi.thumbnail || null,
    author: vi.author || null,
    duration: vi.duration || null,
    uploadDate: vi.uploadDate || null,
    viewCount: vi.viewCount ?? null,
    likeCount: vi.likeCount ?? null,
  };
}

interface SummaryListenerResult {
  summary: string;
  videoInfo: VideoInfoResponse | null | undefined;
  transcript: string | null;
}

interface StreamControl {
  signal?: AbortSignal;
  runId?: string;
}

function createCancellationError(runId?: string): ApiError {
  return {
    message: runId ? `Processing cancelled (run: ${runId})` : "Processing cancelled",
    type: "processing",
  };
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && "message" in error;
}

function toApiError(error: unknown, fallback = "Unknown error"): ApiError {
  if (isApiError(error)) {
    return {
      message: String(error.message || fallback),
      type: error.type || "processing",
    };
  }
  if (error instanceof Error) return { message: error.message, type: "processing" };
  return { message: fallback, type: "processing" };
}

function throwIfAborted(signal?: AbortSignal, runId?: string): void {
  if (signal?.aborted) throw createCancellationError(runId);
}

async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal, runId?: string): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw createCancellationError(runId);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createCancellationError(runId));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * Create a promise-based listener for summary generation
 */
function createSummaryListener(
  videoId: string,
  requestId: RequestId,
  videoInfo: SummaryListenerResult["videoInfo"],
  control?: StreamControl,
): { promise: Promise<SummaryListenerResult>; cancel: () => void } {
  let cleanup = () => {};

  const promise = new Promise<SummaryListenerResult>((resolve, reject) => {
    let settled = false;
    const signal = control?.signal;
    const runId = control?.runId;
    let removeAbortListener: (() => void) | null = null;

    const settle = (handler: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler();
    };

    const listener = (msg: ChromeMessage) => {
      if (
        msg.action === MESSAGE_ACTIONS.SUMMARY_GENERATED &&
        msg.videoId === videoId &&
        msg.requestId === requestId
      ) {
        const {
          summary,
          videoInfo: msgVideoInfo,
          transcript,
        } = msg as ChromeMessage & Partial<SummaryListenerResult>;
        const transcriptText = typeof transcript === "string" ? transcript : null;
        if (!summary) {
          settle(() =>
            reject({
              message: "No summary data received",
              type: "processing",
            } as ApiError),
          );
          return;
        }

        settle(() =>
          resolve({
            summary,
            videoInfo: msgVideoInfo || videoInfo,
            transcript: transcriptText,
          }),
        );
        return;
      }

      if (msg.action !== MESSAGE_ACTIONS.SHOW_ERROR || msg.requestId !== requestId) {
        return;
      }

      settle(() =>
        reject({
          message: (msg.error as string) || "Processing failed",
          type: "processing",
        } as ApiError),
      );
    };

    chrome.runtime.onMessage.addListener(listener);

    const timeoutId = setTimeout(() => {
      console.warn("[stream] summary timeout", {
        videoId,
        requestId,
        runId,
      });
      settle(() =>
        reject({
          message: "The summary request timed out. Please retry or select another model.",
          type: "processing",
        } as ApiError),
      );
    }, TIMING.PROCESSING_TIMEOUT_MS);

    cleanup = () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeoutId);
      removeAbortListener?.();
    };

    if (signal) {
      const onAbort = () => {
        console.log("[stream] summary listener aborted", {
          videoId,
          requestId,
          runId,
        });
        settle(() => reject(createCancellationError(runId)));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        onAbort();
      }
    }
  });

  return {
    promise,
    cancel: () => cleanup?.(),
  };
}

/**
 * Trigger caption refinement
 */
function triggerRefinement(videoId: string, requestId: RequestId, refinerModel: string): void {
  void requestCaptionGeneration(videoId, requestId, refinerModel, undefined).catch((error) =>
    console.error("Caption refinement error:", error),
  );
}

async function requestCaptionGeneration(
  videoId: string,
  requestId: RequestId,
  refinerModel: string,
  options?: { forceRegenerate?: boolean },
) {
  const activeTab = await getCurrentTab();
  const activeTabId = activeTab?.id;

  return sendChromeMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    tabId: activeTabId,
    requestId,
    modelSelection: refinerModel,
    forceRegenerate: options?.forceRegenerate,
  });
}

export async function triggerCaptionGeneration(
  url: string,
  options?: { forceRegenerate?: boolean },
): Promise<void> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  const { refinerModel } = await loadConfig();
  const response = await requestCaptionGeneration(
    videoId,
    createRequestId("caption"),
    refinerModel,
    options,
  );

  if (response?.status === "error") {
    throw new Error(response.message || "Caption generation failed");
  }
}

/**
 * Stream summary: Scrape → Refine (if enabled) + Summarize in parallel.
 * Scraped video details reach `onVideoInfo` before the summary finishes.
 */
export async function streamSummary(
  url: string,
  options: {
    summaryModel?: string;
    targetLanguage?: string | null;
    transcript?: string;
    forceRegenerate?: boolean;
  },
  onVideoInfo?: (videoInfo: VideoInfoResponse) => void,
  control?: StreamControl,
): Promise<StreamingProcessingResult> {
  const signal = control?.signal;
  const runId = control?.runId;
  if (runId) console.log("[stream] start summary run", { runId, url });
  let removeCancellation: (() => void) | undefined;
  let cancelPendingWork: (() => void) | undefined;

  try {
    throwIfAborted(signal, runId);

    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const { summarizerModel, refinerModel, targetLanguage, showSubtitles, summarizerProvider } =
      await withAbort(loadConfig(), signal, runId);
    throwIfAborted(signal, runId);
    const activeTab = await withAbort(getCurrentTab(), signal, runId);
    const activeTabId = activeTab?.id;

    let videoInfo: SummaryListenerResult["videoInfo"] = null;
    if (!options.transcript) {
      videoInfo = await withAbort(performScrape(videoId, activeTabId), signal, runId);
      if (videoInfo && !signal?.aborted) onVideoInfo?.(normalizeVideoInfo(videoInfo, url));
      if (showSubtitles) triggerRefinement(videoId, createRequestId("caption"), refinerModel);
    }

    throwIfAborted(signal, runId);

    const requestId = createRequestId("summary");
    const { promise: listenerPromise, cancel } = createSummaryListener(
      videoId,
      requestId,
      videoInfo,
      control,
    );

    const sendResult = sendChromeMessage({
      action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
      videoId,
      tabId: activeTabId,
      requestId,
      transcript: options.transcript,
      modelSelection: options.summaryModel ?? summarizerModel,
      targetLanguage: options.targetLanguage ?? targetLanguage,
      summarizerProvider,
      forceRegenerate: options.forceRegenerate,
    });
    const cancelBackground = () => {
      void sendChromeMessage({
        action: MESSAGE_ACTIONS.CANCEL_VIDEO_REQUEST,
        kind: "summary",
        videoId,
        requestId,
      }).catch(() => {});
    };
    cancelPendingWork = cancelBackground;
    signal?.addEventListener("abort", cancelBackground, { once: true });
    removeCancellation = () => signal?.removeEventListener("abort", cancelBackground);
    // A cancellation during background configuration loading must also reach the registered job.
    void sendResult.then(
      () => {
        if (signal?.aborted) cancelBackground();
      },
      () => {},
    );

    try {
      const startResponse = await withAbort(sendResult, signal, runId);
      if (startResponse?.status === "error") {
        cancel();
        throw new Error(startResponse.message || "Processing failed");
      }
    } catch (err) {
      cancel();
      if (isApiError(err)) throw err;
      throw new Error(toApiError(err, "Failed to start summarization").message);
    }

    const {
      summary,
      videoInfo: resultVideoInfo,
      transcript,
    } = await withAbort(listenerPromise, signal, runId);

    return {
      success: true,
      videoInfo: normalizeVideoInfo(resultVideoInfo, url),
      transcript,
      summary,
    };
  } catch (error) {
    cancelPendingWork?.();
    return { success: false, error: toApiError(error) };
  } finally {
    removeCancellation?.();
  }
}
