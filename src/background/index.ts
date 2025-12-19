/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { API_ENDPOINTS, ERROR_MESSAGES, MESSAGE_ACTIONS, STORAGE_KEYS } from "@/lib/constants";
import { refineTranscriptWithLLM } from "@/lib/captionRefiner";
import { executeSummarizationWorkflow } from "@/lib/summarizer/captionSummarizer";
import { SubtitleSegment } from "@/lib/storage";

// Allow side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

interface ScrapeCreatorsResponse {
  transcript: {
    segments: TranscriptSegment[];
  };
  title: string;
  description: string;
}

/**
 * Fetch video transcript using Scrape Creators API
 */
async function fetchTranscript(
  videoId: string,
  apiKey: string
): Promise<ScrapeCreatorsResponse | null> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.SCRAPE_CREATORS}?id=${videoId}`,
      {
        headers: {
          "x-api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Scrape API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch transcript error:", error);
    return null;
  }
}

/**
 * Handle fetch subtitles request
 */
async function handleFetchSubtitles(
  message: any,
  tabId: number | undefined,
  sendResponse: (response: any) => void
) {
  const { videoId, scrapeCreatorsApiKey, openRouterApiKey, modelSelection } = message;

  if (!scrapeCreatorsApiKey) {
    sendResponse({ status: "error", message: ERROR_MESSAGES.SCRAPE_KEY_MISSING });
    return;
  }

  if (!openRouterApiKey) {
    sendResponse({ status: "error", message: ERROR_MESSAGES.OPENROUTER_KEY_MISSING });
    return;
  }

  try {
    // 1. Fetch transcript
    const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
    if (!data || !data.transcript) {
      sendResponse({ status: "error", message: ERROR_MESSAGES.NO_TRANSCRIPT });
      return;
    }

    // 2. Refine transcript
    const segments: SubtitleSegment[] = data.transcript.segments.map((s) => ({
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
    }));

    // Inform content script that process started
    sendResponse({ status: "processing" });

    const refinedSegments = await refineTranscriptWithLLM(
      segments,
      data.title,
      data.description,
      openRouterApiKey,
      undefined, // No progress callback for now
      modelSelection
    );

    // 3. Send back results
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
        videoId,
        subtitles: refinedSegments,
      });
    }
  } catch (error) {
    console.error("Refinement error:", error);
    // Optionally notify tab about error
  }
}

/**
 * Handle generate summary request
 */
async function handleGenerateSummary(
  message: any,
  tabId: number | undefined,
  sendResponse: (response: any) => void
) {
  const { videoId, scrapeCreatorsApiKey, openRouterApiKey, modelSelection, targetLanguage } = message;

  if (!scrapeCreatorsApiKey || !openRouterApiKey) {
    sendResponse({ status: "error", message: "Missing API keys" });
    return;
  }

  try {
    const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
    if (!data || !data.transcript) {
      sendResponse({ status: "error", message: ERROR_MESSAGES.NO_TRANSCRIPT });
      return;
    }

    // Convert segments to full text
    const fullTranscript = data.transcript.segments.map((s) => s.text).join(" ");

    sendResponse({ status: "processing" });

    // Use the summarizer workflow
    const result = await executeSummarizationWorkflow(
      {
        transcript: fullTranscript,
        analysis_model: modelSelection,
        quality_model: modelSelection, // Use same model for quality for now, or fetch from settings
        target_language: targetLanguage,
      },
      openRouterApiKey
    );

    // Send result back to sidepanel (how to target sidepanel? usually via runtime message)
    chrome.runtime.sendMessage({
      action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
      videoId,
      summary: result,
    });
  } catch (error) {
    console.error("Summary error:", error);
    chrome.runtime.sendMessage({
      action: MESSAGE_ACTIONS.SHOW_ERROR,
      error: String(error),
    });
  }
}

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.action === MESSAGE_ACTIONS.FETCH_SUBTITLES) {
    handleFetchSubtitles(message, tabId, sendResponse);
    return true;
  } else if (message.action === MESSAGE_ACTIONS.GENERATE_SUMMARY) {
    handleGenerateSummary(message, tabId, sendResponse);
    return true;
  } else if (message.action === MESSAGE_ACTIONS.GET_VIDEO_TITLE) {
    // This is usually handled by content script, but if background gets it, we can't help much without tab access
    // Or we use the scrape API
    sendResponse({ status: "error", message: "Use content script for title" });
    return false;
  }

  return false;
});
