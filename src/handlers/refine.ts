import { MESSAGE_ACTIONS } from "@/core/constants";
import { refineTranscriptWithLLM } from "@/core/refiner";
import {
  clearTranscriptCache,
  fetchTranscript,
  toSubtitleSegments,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";

export async function handleFetchSubtitles(
  message: ChromeMessage,
  ctx: {
    tabId: number | undefined;
    captionRequests: Map<string, string>;
    latestCaptionWorkloads: Map<string, string>;
    pendingCaptionJobs: Map<string, Promise<void>>;
  },
  sendResponse: (response: any) => void,
): Promise<void> {
  const {
    tabId,
    captionRequests,
    latestCaptionWorkloads,
    pendingCaptionJobs,
  } = ctx;
  const { videoId, requestId, modelSelection, forceRegenerate } =
    message as any;

  const workloadKey = `${videoId}:${String(modelSelection)}:${forceRegenerate === true ? "force" : "normal"}`;
  latestCaptionWorkloads.set(videoId, workloadKey);

  if (requestId) {
    captionRequests.set(videoId, String(requestId));
  }

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const getCurrentRequestId = () =>
    captionRequests.get(videoId) || effectiveRequestId || undefined;
  const isCurrentWorkload = () =>
    latestCaptionWorkloads.get(videoId) === workloadKey;

  if (pendingCaptionJobs.has(workloadKey)) {
    await pendingCaptionJobs.get(workloadKey);
    return;
  }

  const job = (async () => {
    try {
      if (forceRegenerate) clearTranscriptCache(videoId);

      const data = await fetchTranscript(videoId);
      if (!data?.transcript?.length) {
        if (tabId && isCurrentWorkload()) {
          chrome.tabs
            .sendMessage(tabId, {
              action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
              videoId,
              requestId: getCurrentRequestId(),
              subtitles: [],
              noTranscript: true,
            })
            .catch(() => {});
        }
        return;
      }

      const segments = toSubtitleSegments(data.transcript);

      const refinedSegments = await refineTranscriptWithLLM(
        segments,
        data.title,
        data.description,
        undefined, // onProgress
        modelSelection,
        (prioritySegments) => {
          if (!isCurrentWorkload()) return;
          if (tabId) {
            chrome.tabs
              .sendMessage(tabId, {
                action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
                videoId,
                requestId: getCurrentRequestId(),
                subtitles: prioritySegments,
                isPartial: true,
              })
              .catch(() => {});
          }
        },
      );

      if (!isCurrentWorkload()) return;

      if (tabId) {
        chrome.tabs
          .sendMessage(tabId, {
            action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
            videoId,
            requestId: getCurrentRequestId(),
            subtitles: refinedSegments,
          })
          .catch(() => {});
      }
    } catch (error) {
      console.error("Refinement error:", error);
    }
  })();

  pendingCaptionJobs.set(workloadKey, job);
  try {
    await job;
  } finally {
    pendingCaptionJobs.delete(workloadKey);
  }
}
