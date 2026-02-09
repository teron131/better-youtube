import { MESSAGE_ACTIONS } from "@/core/constants";
import { refineTranscriptWithLLM } from "@/core/refiner";
import {
  clearTranscriptCache,
  fetchTranscript,
  toSubtitleSegments,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import {
  getCurrentRequestId,
  isCurrentWorkload,
  runPendingJob,
  setLatestWorkload,
} from "./workflow";

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
  const { tabId, captionRequests, latestCaptionWorkloads, pendingCaptionJobs } =
    ctx;
  const { videoId, requestId, modelSelection, forceRegenerate } =
    message as any;

  const workloadKey = `${videoId}:${String(modelSelection)}:${forceRegenerate === true ? "force" : "normal"}`;
  setLatestWorkload(latestCaptionWorkloads, videoId, workloadKey);

  if (requestId) {
    captionRequests.set(videoId, String(requestId));
  }

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const resolveRequestId = () =>
    getCurrentRequestId(captionRequests, videoId, effectiveRequestId);
  const isCurrent = () =>
    isCurrentWorkload(latestCaptionWorkloads, videoId, workloadKey);

  if (pendingCaptionJobs.has(workloadKey)) {
    await pendingCaptionJobs.get(workloadKey);
    return;
  }

  const job = (async () => {
    try {
      if (forceRegenerate) clearTranscriptCache(videoId);

      const data = await fetchTranscript(videoId);
      if (!data?.transcript?.length) {
        if (tabId && isCurrent()) {
          chrome.tabs
            .sendMessage(tabId, {
              action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
              videoId,
              requestId: resolveRequestId(),
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
          if (!isCurrent()) return;
          if (tabId) {
            chrome.tabs
              .sendMessage(tabId, {
                action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
                videoId,
                requestId: resolveRequestId(),
                subtitles: prioritySegments,
                isPartial: true,
              })
              .catch(() => {});
          }
        },
      );

      if (!isCurrent()) return;

      if (tabId) {
        chrome.tabs
          .sendMessage(tabId, {
            action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
            videoId,
            requestId: resolveRequestId(),
            subtitles: refinedSegments,
          })
          .catch(() => {});
      }
    } catch (error) {
      console.error("Refinement error:", error);
    }
  })();

  await runPendingJob(pendingCaptionJobs, workloadKey, job);
}
