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

const transcriptCache = new Map<string, { data: ScrapeCreatorsResponse; timestamp: number }>();
const pendingTranscriptFetches = new Map<string, Promise<ScrapeCreatorsResponse | null>>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache is plenty for deduplication and quick retries

/**
 * Fetch video transcript using Scrape Creators API with deduplication, caching, and retries
 */
async function fetchTranscript(
  videoId: string,
  apiKey: string,
  retries = 2
): Promise<ScrapeCreatorsResponse | null> {
  // 1. Check cache first
  const cached = transcriptCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("Returning cached transcript for videoId:", videoId);
    return cached.data;
  }

  // 2. Check if a fetch is already in progress
  if (pendingTranscriptFetches.has(videoId)) {
    console.log("Waiting for existing transcript fetch for videoId:", videoId);
    return pendingTranscriptFetches.get(videoId)!;
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const url = `${API_ENDPOINTS.SCRAPE_CREATORS}?url=${youtubeUrl}&get_transcript=true`;

  if (!apiKey || apiKey.trim() === "") {
    console.error("API key is missing or empty");
    return null;
  }

  const fetchPromise = (async () => {
    let lastError: Error | null = null;
    
    for (let i = 0; i <= retries; i++) {
      try {
        if (i > 0) {
          console.log(`Retry attempt ${i} for videoId: ${videoId}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * i)); // Exponential-ish backoff
        } else {
          console.log("Fetching transcript for video:", videoId);
        }

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

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error response (attempt ${i+1}):`, errorText);
          throw new Error(`Scrape API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Transcript fetched successfully");

        // Update cache
        transcriptCache.set(videoId, { data, timestamp: Date.now() });

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.name === "AbortError") {
          console.error(`Fetch transcript timeout after 30s (attempt ${i+1})`);
        } else {
          console.error(`Fetch transcript error (attempt ${i+1}):`, lastError.message);
        }
        
        // If it's a 401/403, don't retry
        if (lastError.message.includes("401") || lastError.message.includes("403")) {
          break;
        }
      }
    }
    
    return null;
  })();

  pendingTranscriptFetches.set(videoId, fetchPromise);
  return fetchPromise;
}

async function handleFetchSubtitles(
  message: any,
  tabId: number | undefined,
  sendResponse: (response: any) => void
) {
  const { videoId, scrapeCreatorsApiKey, openRouterApiKey, modelSelection, forceRegenerate } = message;

  if (!scrapeCreatorsApiKey) {
    sendResponse({ status: "error", message: ERROR_MESSAGES.SCRAPE_KEY_MISSING });
    return;
  }

  if (!openRouterApiKey) {
    sendResponse({ status: "error", message: ERROR_MESSAGES.OPENROUTER_KEY_MISSING });
    return;
  }

  try {
    // 1. Fetch transcript (checks cache/pending internally)
    // If forceRegenerate is true, we should probably clear the cache first
    if (forceRegenerate) {
      transcriptCache.delete(videoId);
    }

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

    console.log(`Starting refinement for video: ${videoId}`);
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
    console.log(`Refinement completed for video: ${videoId}`);
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
  const { videoId, scrapeCreatorsApiKey, openRouterApiKey, modelSelection, qualityModel, targetLanguage, fastMode } = message;

  if (!scrapeCreatorsApiKey || !openRouterApiKey) {
    sendResponse({ status: "error", message: "Missing API keys" });
    return;
  }

  try {
    // Check if auto-generation is enabled for coordination logging
    const storage = await chrome.storage.local.get([STORAGE_KEYS.AUTO_GENERATE]);
    const autoGenEnabled = storage[STORAGE_KEYS.AUTO_GENERATE] === true;
    
    if (autoGenEnabled) {
      console.log(`Summary request for ${videoId} is coordinating with auto-generation natural flow.`);
    }

    // Fetch transcript (coordinated via deduplication and caching)
    const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
    
    if (!data) {
      console.error(`Failed to fetch transcript for summary of ${videoId}`);
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
      console.error("No valid transcript text found in response for summary");
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

    console.log(`Transcript ready for summary (${transcriptText.length} chars). Starting summarization workflow...`);
    sendResponse({ status: "processing" });

    // Use the summarizer workflow
    const result = await executeSummarizationWorkflow(
      {
        transcript: transcriptText,
        analysis_model: modelSelection,
        quality_model: qualityModel || modelSelection,
        target_language: targetLanguage,
        fast_mode: fastMode,
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
    console.log(`Summarization workflow completed for video: ${videoId}`);
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
