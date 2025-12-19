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

interface ApiTranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  startTimeText: string;
}

interface ChannelInfo {
  id: string;
  url: string;
  handle: string;
  title: string;
}

interface ScrapeCreatorsResponse {
  transcript: ApiTranscriptSegment[];
  transcript_only_text?: string;
  // Video Info
  title: string;
  description: string;
  thumbnail?: string;
  url?: string;
  id?: string;
  viewCountInt?: number;
  likeCountInt?: number;
  publishDate?: string;
  channel?: ChannelInfo;
  durationFormatted?: string;
  keywords?: string[];
}

/**
 * Fetch video transcript using Scrape Creators API
 */
async function fetchTranscript(
  videoId: string,
  apiKey: string
): Promise<ScrapeCreatorsResponse | null> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  // NOTE: Do NOT encode the YouTube URL - Scrape Creators expects it raw
  const url = `${API_ENDPOINTS.SCRAPE_CREATORS}?url=${youtubeUrl}&get_transcript=true`;
  console.log("Fetching transcript for video:", videoId);

  if (!apiKey || apiKey.trim() === "") {
    console.error("API key is missing or empty");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response:", errorText);
      throw new Error(`Scrape API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Transcript fetched successfully");
    // console.log("Response data structure:", JSON.stringify(data, null, 2).substring(0, 500));
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error("Fetch transcript timeout after 30s");
      } else {
        console.error("Fetch transcript error:", error.message, error);
      }
    } else {
      console.error("Fetch transcript error (unknown):", error);
    }
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
    if (!data || !data.transcript || !Array.isArray(data.transcript)) {
      sendResponse({ status: "error", message: ERROR_MESSAGES.NO_TRANSCRIPT });
      return;
    }

    // 2. Convert API segments to internal format
    const segments: SubtitleSegment[] = data.transcript.map((s) => ({
      text: s.text,
      startTime: s.startMs,
      endTime: s.endMs,
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
    console.log("Fetch transcript result:", data ? "Data received" : "No data");

    if (!data) {
      sendResponse({ status: "error", message: "Failed to fetch transcript from API" });
      return;
    }

    // Extract transcript text from API response
    let transcriptText = "";

    // Check if we have transcript_only_text (preferred)
    if (data.transcript_only_text) {
      transcriptText = data.transcript_only_text;
    }
    // Otherwise, join the segments
    else if (Array.isArray(data.transcript) && data.transcript.length > 0) {
      transcriptText = data.transcript.map((s) => s.text).join(" ");
    }

    if (!transcriptText || transcriptText.trim() === "") {
      console.error("No valid transcript text found in response");
      sendResponse({ status: "error", message: ERROR_MESSAGES.NO_TRANSCRIPT });
      return;
    }

    // Extract video info
    const videoInfo = {
      url: data.url || `https://www.youtube.com/watch?v=${videoId}`,
      title: data.title,
      thumbnail: data.thumbnail,
      author: data.channel?.title || null,
      duration: data.durationFormatted || null,
      upload_date: data.publishDate,
      view_count: data.viewCountInt,
      like_count: data.likeCountInt,
    };

    console.log("Transcript length:", transcriptText.length, "characters");
    sendResponse({ status: "processing" });

    // Use the summarizer workflow
    const result = await executeSummarizationWorkflow(
      {
        transcript: transcriptText,
        analysis_model: modelSelection,
        quality_model: modelSelection, // Use same model for quality for now, or fetch from settings
        target_language: targetLanguage,
      },
      openRouterApiKey
    );

    // Send result back to sidepanel
    chrome.runtime.sendMessage({
      action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
      videoId,
      summary: result,
      videoInfo,
      transcript: transcriptText
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
