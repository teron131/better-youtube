import type { ChromeMessage } from "@/core/utils/chrome";
import { MESSAGE_ACTIONS } from "@/core/constants";
import { refineTranscriptWithLLM } from "@/core/refiner";
import {
  clearTranscriptCache,
  convertToSubtitleSegments,
  fetchTranscript,
} from "@/core/transcript";

export async function handleFetchSubtitles(
  message: ChromeMessage,
  ctx: {
    tabId: number | undefined;
    latestCaptionRequestByVideo: Map<string, string>;
    pendingCaptionJobs: Map<string, Promise<void>>;
  },
  sendResponse: (response: any) => void,
): Promise<void> {
  const { tabId, latestCaptionRequestByVideo, pendingCaptionJobs } = ctx;
  const { videoId, requestId, modelSelection, forceRegenerate } =
    message as any;

  if (requestId) {
    latestCaptionRequestByVideo.set(videoId, String(requestId));
  }

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const jobKey = `${videoId}:${effectiveRequestId}:${modelSelection}`;

  if (pendingCaptionJobs.has(jobKey)) {
    await pendingCaptionJobs.get(jobKey);
    return;
  }

  const job = (async () => {
    try {
      if (forceRegenerate) clearTranscriptCache(videoId);

      const data = await fetchTranscript(videoId);
      if (!data?.transcript?.length) {
        if (tabId) {
          chrome.tabs
            .sendMessage(tabId, {
              action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
              videoId,
              requestId: effectiveRequestId || undefined,
              subtitles: [],
              noTranscript: true,
            })
            .catch(() => {});
        }
        return;
      }

      const segments = convertToSubtitleSegments(data.transcript);

      const isLatest = () => {
        if (!effectiveRequestId) return true;
        return latestCaptionRequestByVideo.get(videoId) === effectiveRequestId;
      };

      const refinedSegments = await refineTranscriptWithLLM(
        segments,
        data.title,
        data.description,
        undefined, // onProgress
        modelSelection,
        (prioritySegments) => {
          if (!isLatest()) return;
          if (tabId) {
            chrome.tabs
              .sendMessage(tabId, {
                action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
                videoId,
                requestId: effectiveRequestId || undefined,
                subtitles: prioritySegments,
                isPartial: true,
              })
              .catch(() => {});
          }
        },
      );

      if (!isLatest()) return;

      if (tabId) {
        chrome.tabs
          .sendMessage(tabId, {
            action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
            videoId,
            requestId: effectiveRequestId || undefined,
            subtitles: refinedSegments,
          })
          .catch(() => {});
      }
    } catch (error) {
      console.error("Refinement error:", error);
    }
  })();

  pendingCaptionJobs.set(jobKey, job);
  try {
    await job;
  } finally {
    pendingCaptionJobs.delete(jobKey);
  }
}
