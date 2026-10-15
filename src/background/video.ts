/**
 * Answers video preview requests with transcript-backed metadata from the requested watch tab.
 */

import { MESSAGE_ACTIONS } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import {
  type CaptionState,
  getCaptionState,
  getSubtitles,
  saveCaptionState,
  saveVideoMetadata,
  type SubtitleSegment,
} from "@/core/storage";
import {
  extractVideoInfo,
  fetchTranscript,
  getResponseTranscriptText,
  getTranscriptText,
  toSubtitleSegments,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import { toTraditionalChinese } from "@/core/utils/text";

import type { VideoWorkloadLifecycle } from "./workloads";

type ScrapeResponse = {
  status: "success" | "error" | "skipped";
  message?: string;
  videoInfo?: ReturnType<typeof extractVideoInfo>;
  transcript?: string | null;
  hasTranscript?: boolean;
  captionState?: CaptionState | null;
  captionSegments?: SubtitleSegment[];
};

function sendScrapeFailure(
  sendResponse: (response: ScrapeResponse) => void,
  suppressErrors: boolean,
  message?: string,
): void {
  sendResponse({
    status: suppressErrors ? "skipped" : "error",
    message: suppressErrors ? undefined : message,
  });
}

/**
 * Handle scrape video request
 */
export async function handleScrapeVideo(
  message: ChromeMessage,
  ctx: { tabId?: number; captionWorkloads: VideoWorkloadLifecycle },
  sendResponse: (response: ScrapeResponse) => void,
): Promise<void> {
  const { videoId, suppressErrors, forceRefresh, captionTrackId } = message as unknown as {
    videoId: string;
    suppressErrors?: boolean;
    forceRefresh?: boolean;
    captionTrackId?: string;
  };

  const requestId = createRequestId("caption");
  const selectionRun = captionTrackId
    ? ctx.captionWorkloads.begin({
        videoId,
        requestId,
        workloadKey: `select:${videoId}:${captionTrackId}:${requestId}`,
      })
    : null;

  const scrape = async () => {
    try {
      const { tabId } = ctx;
      const previousCaptionState = await getCaptionState(videoId);

      const data = await fetchTranscript(videoId, {
        tabId,
        forceRefresh: forceRefresh === true,
        captionTrackId: captionTrackId || previousCaptionState?.selectedTrackId,
      });
      if (selectionRun && !selectionRun.isCurrent()) {
        sendResponse({ status: "skipped" });
        return;
      }
      if (!data) {
        sendScrapeFailure(
          sendResponse,
          suppressErrors === true,
          "Chrome transcript extraction did not return caption data.",
        );
        return;
      }

      const videoInfo = extractVideoInfo(data, videoId);
      await saveVideoMetadata(videoId, videoInfo);

      let captionSegments = data.translationRequired
        ? []
        : toTraditionalChinese(toSubtitleSegments(data.transcript));
      let transcriptText = data.translationRequired
        ? null
        : captionSegments.length
          ? getTranscriptText(captionSegments)
          : getResponseTranscriptText(data);
      let captionState = await getCaptionState(videoId);
      if (
        !captionTrackId &&
        captionState?.selectedTrackId !== previousCaptionState?.selectedTrackId
      ) {
        sendResponse({ status: "skipped" });
        return;
      }
      if (data.selectedCaptionTrackId && data.captionTracks?.length) {
        const preserveCaptions =
          !captionTrackId && captionState?.selectedTrackId === data.selectedCaptionTrackId;
        if (preserveCaptions) {
          if (JSON.stringify(captionState.tracks) !== JSON.stringify(data.captionTracks)) {
            captionState = { ...captionState, tracks: data.captionTracks };
            await saveCaptionState(videoId, captionState);
          }
          const subtitles = await getSubtitles(videoId);
          captionSegments = subtitles ?? [];
          transcriptText = subtitles?.length ? getTranscriptText(subtitles) : null;
        } else {
          captionState = {
            tracks: data.captionTracks,
            selectedTrackId: data.selectedCaptionTrackId,
            status: "original",
            ...(data.translationRequired ? { translationRequired: true } : {}),
          };
          await saveCaptionState(videoId, captionState, captionSegments, selectionRun?.signal);
          if (tabId && (!selectionRun || selectionRun.isCurrent())) {
            void chrome.tabs
              .sendMessage(tabId, {
                action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
                videoId,
                requestId,
                subtitles: captionSegments,
                isRawFallback: true,
              })
              .catch(() => {});
          }
        }
      }
      if (selectionRun && !selectionRun.isCurrent()) {
        sendResponse({ status: "skipped" });
        return;
      }
      sendResponse({
        status: "success",
        videoInfo,
        transcript: transcriptText,
        hasTranscript: !!transcriptText,
        captionState,
        captionSegments,
      });
    } catch (error) {
      if (!suppressErrors) {
        console.error("Scrape video error:", error);
      }
      sendScrapeFailure(
        sendResponse,
        suppressErrors === true,
        error instanceof Error ? error.message : "Failed to fetch video data",
      );
    }
  };

  if (selectionRun) await selectionRun.runOrJoin(scrape);
  else await scrape();
}
