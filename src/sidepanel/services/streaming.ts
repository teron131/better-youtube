/**
 * Chrome Extension Messaging Service
 * Handles communication with background script for video processing
 */

import { ChromeMessage, sendChromeMessage } from "@/core/utils/chrome";
import { MESSAGE_ACTIONS, TIMING } from "@/core/constants";
import { createRequestId, type RequestId } from "@/core/requestId";
import { extractVideoId } from "@/core/utils/url";
import { getProcessingConfig } from "./configLoaders";
import {
  ApiError,
  StreamingProcessingResult,
  StreamingProgressState,
} from "@/core/types";

/**
 * Handle scraping step
 */
async function performScrape(
  videoId: string,
  url: string,
  onProgress?: (state: StreamingProgressState) => void,
): Promise<any> {
  onProgress?.({
    step: "scraping",
    stepName: "Fetching Transcript",
    status: "processing",
    message: "Fetching video transcript...",
  });

  const result = await sendChromeMessage({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
    videoId,
  });

  if (result.status !== "success")
    throw new Error("Failed to fetch video data");

  const videoInfo = result.videoInfo;
  onProgress?.({
    step: "scraping",
    stepName: "Fetching Transcript",
    status: "completed",
    message: "Video data fetched",
    data: {
      videoInfo: videoInfo ? normalizeVideoInfo(videoInfo, url) : undefined,
    },
  });
  return videoInfo;
}

/**
 * Normalize video info from various sources
 */
function normalizeVideoInfo(rawInfo: any, fallbackUrl: string): any {
  const vi = rawInfo || {};
  return {
    url: vi.url || fallbackUrl,
    title: vi.title || null,
    thumbnail: vi.thumbnail || null,
    author: vi.author || null,
    duration: vi.duration || null,
    upload_date: vi.upload_date || null,
    view_count: vi.view_count ?? null,
    like_count: vi.like_count ?? null,
  };
}

interface SummaryListenerResult {
  summary: any;
  videoInfo: any;
  transcript: string | null;
}

/**
 * Create a promise-based listener for summary generation
 */
function createSummaryListener(
  videoId: string,
  requestId: RequestId,
  url: string,
  videoInfo: any,
  onProgress?: (state: StreamingProgressState) => void,
): { promise: Promise<SummaryListenerResult>; cancel: () => void } {
  let cleanup: () => void;
  let timeoutId: NodeJS.Timeout;

  const promise = new Promise<SummaryListenerResult>((resolve, reject) => {
    const listener = (msg: ChromeMessage) => {
      if (
        msg.action === MESSAGE_ACTIONS.SUMMARY_GENERATED &&
        msg.videoId === videoId &&
        msg.requestId === requestId
      ) {
        cleanup();
        const { summary, videoInfo: msgVideoInfo, transcript } = msg;
        if (!summary) {
          return reject({
            message: "No summary data received",
            type: "processing",
          } as ApiError);
        }

        onProgress?.({
          step: "complete",
          stepName: "Complete",
          status: "completed",
          message: "Summary generated successfully",
        });
        resolve({
          summary,
          videoInfo: msgVideoInfo || videoInfo,
          transcript: transcript || null,
        });
      } else if (
        msg.action === MESSAGE_ACTIONS.SHOW_ERROR &&
        (msg as any).requestId === requestId
      ) {
        cleanup();
        reject({
          message: (msg as any).error || "Processing failed",
          type: "processing",
        } as ApiError);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    timeoutId = setTimeout(() => {
      cleanup();
      reject({
        message: "Processing timeout after 2 minutes",
        type: "processing",
      } as ApiError);
    }, TIMING.PROCESSING_TIMEOUT_MS);

    cleanup = () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timeoutId);
    };
  });

  return {
    promise,
    cancel: () => cleanup?.(),
  };
}

/**
 * Trigger caption refinement
 */
function triggerRefinement(
  videoId: string,
  requestId: RequestId,
  refinerModel: string,
): void {
  sendChromeMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    requestId,
    modelSelection: refinerModel,
  }).catch((err) => console.error("Caption refinement error:", err));
}

export async function triggerCaptionGeneration(
  url: string,
  options?: { forceRegenerate?: boolean },
): Promise<void> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  const { refinerModel } = await getProcessingConfig();

  const response = await sendChromeMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    requestId: createRequestId("caption"),
    modelSelection: refinerModel,
    forceRegenerate: options?.forceRegenerate,
  });

  if (response?.status === "error") {
    throw new Error(response.message || "Caption generation failed");
  }
}

/**
 * Stream summary: Scrape → Refine (if enabled) + Summarize in parallel
 */
export async function streamSummary(
  url: string,
  options: {
    summaryModel?: string;
    qualityModel?: string;
    targetLanguage?: string | null;
    fastMode?: boolean;
    transcript?: string;
    forceRegenerate?: boolean;
  },
  onProgress?: (state: StreamingProgressState) => void,
): Promise<StreamingProcessingResult> {
  const startTime = Date.now();
  const formatTime = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const { summarizerModel, refinerModel, targetLanguage, showSubtitles } =
      await getProcessingConfig();

    let videoInfo: any = null;
    if (!options.transcript) {
      videoInfo = await performScrape(videoId, url, onProgress);
      if (showSubtitles)
        triggerRefinement(videoId, createRequestId("caption"), refinerModel);
    } else {
      onProgress?.({
        step: "scraping",
        stepName: "Fetching Transcript",
        status: "completed",
        message: "Using provided transcript",
      });
    }

    onProgress?.({
      step: "summarizing",
      stepName: "Summarizing",
      status: "processing",
      message: "Generating summary...",
    });

    const requestId = createRequestId("summary");
    const { promise: listenerPromise, cancel } = createSummaryListener(
      videoId,
      requestId,
      url,
      videoInfo,
      onProgress,
    );

    const sendResult = sendChromeMessage({
      action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
      videoId,
      requestId,
      transcript: options.transcript,
      modelSelection: options.summaryModel || summarizerModel,
      qualityModel: options.qualityModel,
      refinerModel,
      targetLanguage: options.targetLanguage || targetLanguage,
      fastMode: options.fastMode,
      forceRegenerate: options.forceRegenerate,
    });

    sendResult
      .then((r) => {
        if (r?.status === "error") {
          cancel();
          throw new Error(r.message || "Processing failed");
        }
      })
      .catch((err) => {
        cancel();
        throw new Error(err.message || "Failed to start summarization");
      });

    const {
      summary,
      videoInfo: resultVideoInfo,
      transcript,
    } = await listenerPromise;

    return {
      success: true,
      videoInfo: normalizeVideoInfo(resultVideoInfo, url),
      transcript,
      summary: summary.summary,
      quality: summary.quality,
      summaryText: summary.summary_text,
      qualityScore: summary.quality_score,
      totalTime: formatTime(),
      iterationCount: summary.iteration_count || 0,
      chunksProcessed: 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const apiError: ApiError = { message: msg, type: "processing" };
    onProgress?.({
      step: "summarizing",
      stepName: "Processing",
      status: "error",
      message: msg,
      error: apiError,
    });
    return {
      success: false,
      totalTime: formatTime(),
      iterationCount: 0,
      chunksProcessed: 0,
      error: apiError,
    };
  }
}
