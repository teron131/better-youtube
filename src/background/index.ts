/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { refineTranscriptWithLLM } from "@/lib/captionRefiner";
import { API_ENDPOINTS, ERROR_MESSAGES, MESSAGE_ACTIONS, TIMING } from "@/lib/constants";
import { SubtitleSegment, VideoMetadata, getStoredAnalysis, getStoredSubtitles, getStoredVideoMetadata, saveAnalysis, saveVideoMetadata } from "@/lib/storage";
import { executeSummarizationWorkflow } from "@/lib/summarizer/captionSummarizer";
import { checkStoredAnalysis, broadcastStoredAnalysis, resolveTranscriptSource, resolveVideoInfo, broadcastSummaryResult } from "./summaryHelpers";
import { validateApiKeys, validateVideoId } from "./validation";

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

export interface ScrapeCreatorsResponse {
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

/**
 * Extract video info from ScrapeCreatorsResponse in the expected format
 */
function extractVideoInfo(data: ScrapeCreatorsResponse, videoId: string) {
  return {
    url: data.url || `https://www.youtube.com/watch?v=${videoId}`,
    title: data.title || null,
    thumbnail: data.thumbnail || null,
    author: data.channel?.title || null,
    duration: data.durationFormatted || null,
    upload_date: data.publishDate || null,
    view_count: data.viewCountInt ?? null,
    like_count: data.likeCountInt ?? null,
  };
}

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
  if (cached && Date.now() - cached.timestamp < TIMING.TRANSCRIPT_CACHE_TTL_MS) {
    console.log("Returning cached transcript for videoId:", videoId);
    return cached.data;
  }

  // 2. Check if a fetch is already in progress
  if (pendingTranscriptFetches.has(videoId)) {
    console.log("Waiting for existing transcript fetch for videoId:", videoId);
    return pendingTranscriptFetches.get(videoId)!;
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const requestUrl = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
  requestUrl.searchParams.set("url", youtubeUrl);
  requestUrl.searchParams.set("get_transcript", "true");

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
          await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_BACKOFF_MULTIPLIER_MS * i));
        } else {
          console.log("Fetching transcript for video:", videoId);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMING.SCRAPE_API_TIMEOUT_MS);

        const response = await fetch(requestUrl.toString(), {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "Accept": "application/json",
          },
          cache: "no-store",
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

/**
 * Handle scrape video request - fetches and saves video metadata and transcript
 * This should be called first before refine/summarize to ensure data is available
 */
async function handleScrapeVideo(
  message: any,
  tabId: number | undefined,
  sendResponse: (response: any) => void
) {
  const { videoId, scrapeCreatorsApiKey } = message;

  if (!scrapeCreatorsApiKey) {
    sendResponse({ status: "error", message: ERROR_MESSAGES.SCRAPE_KEY_MISSING });
    return;
  }

  try {
    console.log(`Scraping video data for ${videoId}...`);
    const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);

    if (!data) {
      sendResponse({ status: "error", message: "Failed to fetch video data" });
      return;
    }

    // Extract and save video metadata to persistent storage
    const videoInfo = extractVideoInfo(data, videoId);
    await saveVideoMetadata(videoId, videoInfo);

    // Extract transcript text
    const transcriptText = data.transcript_only_text ||
      (data.transcript?.map(s => s.text).join(" ") || null);

    console.log(`Video data scraped and saved for ${videoId}`);

    // Send response back
    sendResponse({
      status: "success",
      videoInfo,
      hasTranscript: !!transcriptText && transcriptText.length > 0
    });

    // Also broadcast to sidepanel so it can display video info immediately
    chrome.runtime.sendMessage({
      action: MESSAGE_ACTIONS.SCRAPE_VIDEO_COMPLETED,
      videoId,
      videoInfo,
      transcript: transcriptText
    });

  } catch (error) {
    console.error("Scrape video error:", error);
    sendResponse({ status: "error", message: String(error) });
  }
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

  // Inform content script that process started
  sendResponse({ status: "processing" });

  // Run refinement in background (don't await)
  (async () => {
    try {
      // 1. Fetch transcript (checks cache/pending internally)
      if (forceRegenerate) {
        transcriptCache.delete(videoId);
      }

      const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
      if (!data || !data.transcript || !Array.isArray(data.transcript)) {
        throw new Error(ERROR_MESSAGES.NO_TRANSCRIPT);
      }

      // 2. Convert API segments to internal format
      const segments: SubtitleSegment[] = data.transcript.map((s) => ({
        text: s.text,
        startTime: s.startMs,
        endTime: s.endMs,
      }));

      console.log(`Starting refinement for video: ${videoId}`);
      const refinedSegments = await refineTranscriptWithLLM(
        segments,
        data.title,
        data.description,
        openRouterApiKey,
        undefined, // No progress callback for now
        modelSelection
      );

      // 3. Send back results to content script
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
    }
  })();
}

/**
 * Handle generate summary request
 * Assumes scrape has already been called to fetch and cache video data
 */
async function handleGenerateSummary(
  message: any,
  tabId: number | undefined,
  sendResponse: (response: any) => void
) {
  const {
    videoId,
    transcript: messageTranscript,
    scrapeCreatorsApiKey,
    openRouterApiKey,
    modelSelection,
    qualityModel,
    refinerModel,
    targetLanguage,
    fastMode,
    forceRegenerate
  } = message;

  // Validate API keys
  const validation = validateApiKeys({ scrapeCreatorsApiKey, openRouterApiKey });
  if (!validation.valid) {
    sendResponse({ status: "error", message: validation.error });
    return;
  }

  sendResponse({ status: "processing" });

  try {
    // Check for stored analysis (unless force regenerate)
    const storedAnalysis = await checkStoredAnalysis(videoId, modelSelection, targetLanguage, forceRegenerate);
    if (storedAnalysis) {
      await broadcastStoredAnalysis(videoId, storedAnalysis);
      return;
    }

    // Resolve transcript source (message → cache → stored → URL)
    const transcript_or_url = await resolveTranscriptSource(videoId, messageTranscript, transcriptCache);

    // Resolve video info (stored → cache → fetch)
    const videoInfo = await resolveVideoInfo(
      videoId,
      transcriptCache,
      extractVideoInfo,
      fetchTranscript,
      scrapeCreatorsApiKey
    );

    console.log(`Input ready for summary (type: ${transcript_or_url.startsWith("http") ? "URL" : "Transcript"}). Starting workflow...`);

    // Execute summarization workflow
    const result = await executeSummarizationWorkflow(
      {
        transcript_or_url,
        videoId,
        scrapeCreatorsApiKey,
        analysis_model: modelSelection,
        quality_model: qualityModel || modelSelection,
        refiner_model: refinerModel,
        target_language: targetLanguage,
        fast_mode: fastMode,
      },
      openRouterApiKey
    );

    // Broadcast result and save to storage
    await broadcastSummaryResult(
      videoId,
      result,
      videoInfo,
      transcript_or_url,
      modelSelection,
      targetLanguage
    );
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

  switch (message.action) {
    case MESSAGE_ACTIONS.SCRAPE_VIDEO:
      handleScrapeVideo(message, tabId, sendResponse);
      return true;

    case MESSAGE_ACTIONS.FETCH_SUBTITLES:
      handleFetchSubtitles(message, tabId, sendResponse);
      return true;

    case MESSAGE_ACTIONS.GENERATE_SUMMARY:
      handleGenerateSummary(message, tabId, sendResponse);
      return true;

    case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
      // This is usually handled by content script, but if background gets it, we can't help much
      sendResponse({ status: "error", message: "Use content script for title" });
      return false;

    default:
      return false;
  }
});
