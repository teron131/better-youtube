/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { refineTranscriptWithLLM } from "@/lib/captionRefiner";
import { ChromeMessage, createMessageListener } from "@/lib/chromeUtils";
import { ERROR_MESSAGES, MESSAGE_ACTIONS } from "@/lib/constants";
import { saveVideoMetadata } from "@/lib/storage";
import { executeSummarizationWorkflow } from "@/lib/summarizer/captionSummarizer";
import { clearTranscriptCache, convertToSubtitleSegments, extractVideoInfo, fetchTranscript } from "@/lib/youtubeApi";
import { broadcastStoredSummary, broadcastSummaryResult, checkStoredSummary, resolveTranscriptSource, resolveVideoInfo } from "./summaryHelpers";
import { validateApiKeys } from "./validation";

const latestCaptionRequestByVideo = new Map<string, string>();
const latestSummaryRequestByVideo = new Map<string, string>();
const pendingCaptionJobs = new Map<string, Promise<void>>();
const pendingSummaryJobs = new Map<string, Promise<void>>();


// Allow side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

/**
 * Handle scrape video request
 */
async function handleScrapeVideo(message: ChromeMessage, sendResponse: (response: any) => void) {
  const { videoId, scrapeCreatorsApiKey } = message;

  // We don't need to check scrapeCreatorsApiKey from message here anymore as fetchTranscript handles it from storage.
  // But we might want to keep the validation check if we assume the UI validates it first?
  // Actually, fetchTranscript now returns null if keys are missing in storage.
  // So we can remove the explicit check here OR ensure it checks storage.
  // Let's remove the argument passing.

  const data = await fetchTranscript(videoId);
  if (!data) {
    return sendResponse({ status: "error", message: "Failed to fetch video data (Check API Key)" });
  }

  const videoInfo = extractVideoInfo(data, videoId);
  await saveVideoMetadata(videoId, videoInfo);

  const transcriptText = data.transcript_only_text || data.transcript?.map(s => s.text).join(" ") || null;

  sendResponse({ status: "success", videoInfo, hasTranscript: !!transcriptText });

  chrome.runtime.sendMessage({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO_COMPLETED,
    videoId,
    videoInfo,
    transcript: transcriptText,
  }).catch(() => {}); // Ignore errors if no listeners
}

/**
 * Handle fetch subtitles request
 */
async function handleFetchSubtitles(message: ChromeMessage, tabId: number | undefined, sendResponse: (response: any) => void) {
  const { videoId, requestId, openRouterApiKey, modelSelection, forceRegenerate } = message;

  if (requestId) {
    latestCaptionRequestByVideo.set(videoId, String(requestId));
  }

  // Scrape key check moved to fetchTranscript internals
  if (!openRouterApiKey) return sendResponse({ status: "error", message: ERROR_MESSAGES.OPENROUTER_KEY_MISSING });

  sendResponse({ status: "processing" });

  const effectiveRequestId = requestId ? String(requestId) : "";
  const jobKey = `${videoId}:${effectiveRequestId}:${modelSelection}`;

  if (pendingCaptionJobs.has(jobKey)) {
    try {
      await pendingCaptionJobs.get(jobKey);
    } finally {
      // no-op
    }
    return;
  }

  const job = (async () => {
    try {
      if (forceRegenerate) clearTranscriptCache(videoId);

      const data = await fetchTranscript(videoId);
      if (!data?.transcript?.length) {
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
            videoId,
            requestId: effectiveRequestId || undefined,
            subtitles: [],
            noTranscript: true,
          }).catch(() => {});
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
        openRouterApiKey,
        undefined,
        modelSelection,
        (prioritySegments) => {
          if (!isLatest()) return;
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
              videoId,
              requestId: effectiveRequestId || undefined,
              subtitles: prioritySegments,
              isPartial: true,
            }).catch(() => {});
          }
        }
      );

      if (!isLatest()) return;

      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
          videoId,
          requestId: effectiveRequestId || undefined,
          subtitles: refinedSegments,
        }).catch(() => {});
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

/**
 * Handle generate summary request
 */
async function handleGenerateSummary(message: ChromeMessage, sendResponse: (response: any) => void) {
  const {
    videoId, requestId, transcript: msgTranscript, scrapeCreatorsApiKey, openRouterApiKey,
    modelSelection, qualityModel, refinerModel, targetLanguage, fastMode, forceRegenerate
  } = message;

  if (requestId) {
    latestSummaryRequestByVideo.set(videoId, String(requestId));
  }


  const validation = validateApiKeys({ scrapeCreatorsApiKey, openRouterApiKey });
  if (!validation.valid) return sendResponse({ status: "error", message: validation.error });

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
        return await broadcastStoredSummary(videoId, storedSummary, effectiveRequestId || undefined);
      }

      const transcript_or_url = await resolveTranscriptSource(videoId, msgTranscript);
      const videoInfo = await resolveVideoInfo(videoId);

      const result = await executeSummarizationWorkflow({
        transcript_or_url, videoId, scrapeCreatorsApiKey,
        summary_model: modelSelection, quality_model: qualityModel || modelSelection,
        refiner_model: refinerModel, target_language: targetLanguage, fast_mode: fastMode,
      }, openRouterApiKey);

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
      chrome.runtime.sendMessage({
        action: MESSAGE_ACTIONS.SHOW_ERROR,
        error: String(error),
        requestId: effectiveRequestId || undefined,
        videoId,
      }).catch(() => {});
    }
  })();

  pendingSummaryJobs.set(jobKey, job);
  try {
    await job;
  } finally {
    pendingSummaryJobs.delete(jobKey);
  }
}

/**
 * Main message listener
 */
createMessageListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.action) {
    case MESSAGE_ACTIONS.SCRAPE_VIDEO:
      handleScrapeVideo(message, sendResponse);
      return true;

    case MESSAGE_ACTIONS.FETCH_SUBTITLES:
      handleFetchSubtitles(message, tabId, sendResponse);
      return true;

    case MESSAGE_ACTIONS.GENERATE_SUMMARY:
      handleGenerateSummary(message, sendResponse);
      return true;

    case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
      sendResponse({ status: "error", message: "Use content script for title" });
      return false;

    default:
      return false;
  }
});
