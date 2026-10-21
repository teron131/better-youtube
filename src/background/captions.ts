/** Runs caption extraction and AI refinement or English translation, publishing raw, priority, and final segments in order. */

import { MESSAGE_ACTIONS } from "@/core/constants";
import {
  getRefinerWorkloadStats,
  refineTranscriptWithLLM,
  translateTranscriptWithLLM,
} from "@/core/refiner";
import {
  type CaptionState,
  getCaptionState,
  saveCaptionState,
  saveVideoMetadata,
} from "@/core/storage";
import {
  clearTranscriptCache,
  extractVideoInfo,
  fetchTranscript,
  toSubtitleSegments,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import { toTraditionalChinese } from "@/core/utils/text";

import type { VideoWorkloadLifecycle, VideoWorkloadRun } from "./workloads";

export async function handleFetchSubtitles(
  message: ChromeMessage,
  ctx: {
    tabId: number | undefined;
    captionWorkloads: VideoWorkloadLifecycle;
  },
  sendResponse: (response: any) => void,
): Promise<void> {
  const { tabId, captionWorkloads } = ctx;
  const { videoId, requestId, modelSelection, forceRegenerate } = message as any;
  const storedCaptionState = await getCaptionState(videoId);
  const translationConfirmed = message.confirmTranslation === true;
  if (storedCaptionState?.translationRequired && !translationConfirmed) {
    sendResponse({
      status: "error",
      message: "Choose Translate, then Confirm to translate the selected captions into English.",
    });
    return;
  }
  const captionTrackId =
    typeof message.captionTrackId === "string"
      ? message.captionTrackId
      : storedCaptionState?.selectedTrackId;
  if (message.captionTrackId && storedCaptionState?.selectedTrackId !== message.captionTrackId) {
    sendResponse({
      status: "error",
      message: "The selected caption track changed. Choose it again before refining.",
    });
    return;
  }

  const workloadKey = `${videoId}:${captionTrackId || "default"}:${translationConfirmed ? "translate" : "refine"}:${String(modelSelection)}:${forceRegenerate === true ? "force" : "normal"}`;
  const run = captionWorkloads.begin({
    videoId,
    requestId,
    workloadKey,
  });

  sendResponse({ status: "processing" });

  const emitCaptionError = (messageText: string) => {
    chrome.runtime
      .sendMessage({
        action: MESSAGE_ACTIONS.SHOW_ERROR,
        error: messageText,
        requestId: run.resolveRequestId(),
        videoId,
      })
      .catch(() => {});
  };

  await run.runOrJoin(
    () =>
      runCaptionJob({
        videoId,
        tabId,
        modelSelection,
        captionTrackId,
        translationConfirmed,
        forceRegenerate,
        emitCaptionError,
        run,
      }),
    () => {
      console.log("[refine] dedupe join existing workload", {
        videoId,
        requestId: run.effectiveRequestId,
        workloadKey,
      });
    },
  );
}

async function runCaptionJob(input: {
  videoId: string;
  tabId: number | undefined;
  modelSelection: unknown;
  captionTrackId?: string;
  translationConfirmed: boolean;
  forceRegenerate: unknown;
  emitCaptionError: (messageText: string) => void;
  run: VideoWorkloadRun;
}): Promise<void> {
  const {
    videoId,
    tabId,
    modelSelection,
    captionTrackId,
    translationConfirmed,
    forceRegenerate,
    emitCaptionError,
    run,
  } = input;
  let captionState: CaptionState | null = null;
  const sendSubtitlesToTab = (subtitles: unknown[], extraPayload: Record<string, unknown> = {}) => {
    if (!tabId || !run.isCurrent()) {
      return;
    }
    chrome.tabs
      .sendMessage(tabId, {
        action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
        videoId,
        requestId: run.resolveRequestId(),
        subtitles,
        ...extraPayload,
      })
      .catch(() => {});
  };

  try {
    if (forceRegenerate) clearTranscriptCache(videoId);

    const data = await fetchTranscript(videoId, {
      tabId,
      captionTrackId,
    });
    if (!run.isCurrent()) return;
    if (data) {
      await saveVideoMetadata(videoId, extractVideoInfo(data, videoId));
    }
    if (!data?.transcript?.length || !data.selectedCaptionTrackId || !data.captionTracks?.length) {
      // Videos without captions are an expected outcome, not a failure worth an extension error.
      console.info("[refine] no transcript available", {
        videoId,
        requestId: run.effectiveRequestId,
      });
      sendSubtitlesToTab([], { noTranscript: true });
      return;
    }

    const segments = toSubtitleSegments(data.transcript);
    if (data.translationRequired && !translationConfirmed) {
      await saveCaptionState(
        videoId,
        {
          tracks: data.captionTracks,
          selectedTrackId: data.selectedCaptionTrackId,
          status: "original",
          translationRequired: true,
        },
        [],
        run.signal,
      );
      sendSubtitlesToTab([], { isRawFallback: true });
      emitCaptionError(
        "YouTube translation is unavailable. Choose Translate, then Confirm to use your caption model.",
      );
      return;
    }
    captionState = {
      tracks: data.captionTracks,
      selectedTrackId: data.selectedCaptionTrackId,
      status: "refining",
      ...(data.translationRequired ? { translationRequired: true } : {}),
    };
    const workload = getRefinerWorkloadStats(segments);
    console.log("[refine] transcript workload", {
      videoId,
      requestId: run.effectiveRequestId,
      segmentCount: workload.segmentCount,
      chunkCount: workload.chunkCount,
    });
    if (!run.isCurrent()) return;
    const initialSegments = data.translationRequired ? [] : toTraditionalChinese(segments);
    await saveCaptionState(videoId, captionState, initialSegments, run.signal);
    sendSubtitlesToTab(initialSegments, {
      isRawFallback: true,
    });

    console.log("[refine] started", {
      videoId,
      requestId: run.effectiveRequestId,
      chunkCount: workload.chunkCount,
    });
    const processCaptions = data.translationRequired
      ? translateTranscriptWithLLM
      : refineTranscriptWithLLM;
    const refinedSegments = toTraditionalChinese(
      await processCaptions(
        segments,
        data.title,
        data.description,
        String(modelSelection),
        (prioritySegments) => {
          console.log("[refine] partial emitted", {
            videoId,
            requestId: run.effectiveRequestId,
            segmentCount: prioritySegments.length,
          });
          sendSubtitlesToTab(toTraditionalChinese(prioritySegments), { isPartial: true });
        },
      ),
    );

    if (!run.isCurrent()) return;
    await saveCaptionState(
      videoId,
      { ...captionState, status: "refined" },
      refinedSegments,
      run.signal,
    );
    console.log("[refine] completed", {
      videoId,
      requestId: run.effectiveRequestId,
      segmentCount: refinedSegments.length,
    });
    sendSubtitlesToTab(refinedSegments);
  } catch (error) {
    if (!run.isCurrent()) return;
    console.error("Refinement error:", error);
    const message = error instanceof Error ? error.message : "Caption refinement failed.";
    const failedState = captionState ?? (await getCaptionState(videoId));
    if (failedState)
      await saveCaptionState(
        videoId,
        { ...failedState, status: "error", error: message },
        undefined,
        run.signal,
      );
    if (failedState?.translationRequired) sendSubtitlesToTab([]);
    emitCaptionError(message);
  }
}
