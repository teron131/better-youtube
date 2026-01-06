/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { refineTranscriptWithLLM } from "@/lib/captionRefiner";
import { ChromeMessage, createMessageListener } from "@/lib/chromeUtils";
import { ERROR_MESSAGES, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/lib/constants";
import { saveVideoMetadata, getStorageValues } from "@/lib/storage";
import { executeSummarizationWorkflow } from "@/lib/summarizer/captionSummarizer";
import { clearTranscriptCache, convertToSubtitleSegments, extractVideoInfo, fetchTranscript } from "@/lib/youtubeApi";
import { broadcastStoredSummary, broadcastSummaryResult, checkStoredSummary, resolveTranscriptSource, resolveVideoInfo } from "./summaryHelpers";
import { validateApiKeys } from "./validation";
import { convertSubtitlesForTargetLanguage } from "@/lib/captionConversion";
import { getTargetLanguageFromStorage } from "@/content/contentHelpers";

// Allow side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

/**
 * Get target language from chrome storage
 */
async function getTargetLanguage(): Promise<string> {
  const result = await getStorageValues<Record<string, any>>([
    STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
    STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED
  ]);
  return getTargetLanguageFromStorage(result);
}

/**
 * Handle scrape video request
 */
async function handleScrapeVideo(message: ChromeMessage, sendResponse: (response: any) => void) {
  const { videoId, scrapeCreatorsApiKey } = message;

  if (!scrapeCreatorsApiKey) {
    return sendResponse({ status: "error", message: ERROR_MESSAGES.SCRAPE_KEY_MISSING });
  }

  const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
  if (!data) {
    return sendResponse({ status: "error", message: "Failed to fetch video data" });
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
  const { videoId, scrapeCreatorsApiKey, openRouterApiKey, modelSelection, forceRegenerate } = message;

  if (!scrapeCreatorsApiKey) return sendResponse({ status: "error", message: ERROR_MESSAGES.SCRAPE_KEY_MISSING });
  if (!openRouterApiKey) return sendResponse({ status: "error", message: ERROR_MESSAGES.OPENROUTER_KEY_MISSING });

  sendResponse({ status: "processing" });

  try {
    if (forceRegenerate) clearTranscriptCache(videoId);

    // Get target language for conversion
    const targetLanguage = await getTargetLanguage();

    const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
    if (!data?.transcript?.length) {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
          videoId,
          subtitles: [],
          noTranscript: true
        }).catch(() => {});
      }
      return;
    }

    const segments = convertToSubtitleSegments(data.transcript);
    const refinedSegments = await refineTranscriptWithLLM(
      segments,
      data.title,
      data.description,
      openRouterApiKey,
      undefined,
      modelSelection,
      (prioritySegments) => {
        if (tabId) {
          // Convert partial segments before sending
          const convertedPartial = convertSubtitlesForTargetLanguage(prioritySegments, targetLanguage);
          chrome.tabs.sendMessage(tabId, {
            action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
            videoId,
            subtitles: convertedPartial,
            isPartial: true
          }).catch(() => {});
        }
      }
    );

    // Convert final refined segments before sending
    const convertedSegments = convertSubtitlesForTargetLanguage(refinedSegments, targetLanguage);

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
        videoId,
        subtitles: convertedSegments,
      }).catch(() => {});
    }
  } catch (error) {
    console.error("Refinement error:", error);
  }
}

/**
 * Handle generate summary request
 */
async function handleGenerateSummary(message: ChromeMessage, sendResponse: (response: any) => void) {
  const {
    videoId, transcript: msgTranscript, scrapeCreatorsApiKey, openRouterApiKey,
    modelSelection, qualityModel, refinerModel, targetLanguage, fastMode, forceRegenerate
  } = message;

  const validation = validateApiKeys({ scrapeCreatorsApiKey, openRouterApiKey });
  if (!validation.valid) return sendResponse({ status: "error", message: validation.error });

  sendResponse({ status: "processing" });

  try {
    const storedSummary = await checkStoredSummary(videoId, modelSelection, targetLanguage, forceRegenerate);
    if (storedSummary) {
      return await broadcastStoredSummary(videoId, storedSummary);
    }

    const transcript_or_url = await resolveTranscriptSource(videoId, msgTranscript);
    const videoInfo = await resolveVideoInfo(videoId, scrapeCreatorsApiKey);

    const result = await executeSummarizationWorkflow({
      transcript_or_url, videoId, scrapeCreatorsApiKey,
      summary_model: modelSelection, quality_model: qualityModel || modelSelection,
      refiner_model: refinerModel, target_language: targetLanguage, fast_mode: fastMode,
    }, openRouterApiKey);

    await broadcastSummaryResult(videoId, result, videoInfo, transcript_or_url, modelSelection, targetLanguage);
  } catch (error) {
    console.error("Summary error:", error);
    chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.SHOW_ERROR, error: String(error) }).catch(() => {});
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