import type { ChromeMessage } from "@/lib/utils/chrome";
import { MESSAGE_ACTIONS } from "@/lib/core/constants";
import { executeSummarizationWorkflow } from "@/lib/summarizer/captionSummarizer";

import {
  broadcastStoredSummary,
  broadcastSummaryResult,
  checkStoredSummary,
  resolveTranscriptSource,
  resolveVideoInfo,
} from "../summaryHelpers";

export async function handleGenerateSummary(
  message: ChromeMessage,
  ctx: {
    latestSummaryRequestByVideo: Map<string, string>;
    pendingSummaryJobs: Map<string, Promise<void>>;
  },
  sendResponse: (response: any) => void
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
  } = message as any;

  if (requestId) {
    latestSummaryRequestByVideo.set(videoId, String(requestId));
  }

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const jobKey = `${videoId}:${effectiveRequestId}:${modelSelection}:${targetLanguage}:${fastMode ? "fast" : "full"}`;

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
      const storedSummary = await checkStoredSummary(videoId, modelSelection, targetLanguage, forceRegenerate);
      if (storedSummary) {
        if (!isLatest()) return;
        await broadcastStoredSummary(videoId, storedSummary, effectiveRequestId || undefined);
        return;
      }

      const transcript_or_url = await resolveTranscriptSource(videoId, msgTranscript);
      const videoInfo = await resolveVideoInfo(videoId);

      const result = await executeSummarizationWorkflow({
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

      if (!isLatest()) return;

      await broadcastSummaryResult(
        videoId,
        result,
        videoInfo,
        transcript_or_url,
        modelSelection,
        targetLanguage,
        effectiveRequestId || undefined
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
