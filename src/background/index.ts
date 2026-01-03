/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { refineTranscriptWithLLM } from "@/lib/captionRefiner";
import { API_ENDPOINTS, ERROR_MESSAGES, MESSAGE_ACTIONS, TIMING } from "@/lib/constants";
import { SubtitleSegment, saveVideoMetadata } from "@/lib/storage";
import { executeSummarizationWorkflow } from "@/lib/summarizer/captionSummarizer";
import { broadcastStoredAnalysis, broadcastSummaryResult, checkStoredAnalysis, resolveTranscriptSource, resolveVideoInfo } from "./summaryHelpers";
import { validateApiKeys } from "./validation";
import { createMessageListener, ChromeMessage } from "@/lib/chromeUtils";

// Allow side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

interface ApiTranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  startTimeText: string;
}

interface RawTranscriptSegment {
  text: string;
  startMs: string | number;
  endMs: string | number;
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
 * Normalizes raw API response to ensure numbers are numbers
 */
function normalizeApiResponse(data: any): ScrapeCreatorsResponse {
  if (data.transcript && Array.isArray(data.transcript)) {
    data.transcript = data.transcript.map((s: RawTranscriptSegment) => ({
      ...s,
      startMs: Number(s.startMs),
      endMs: Number(s.endMs),
    }));
  }
  return data as ScrapeCreatorsResponse;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const transcriptCache = new Map<string, { data: ScrapeCreatorsResponse; timestamp: number }>();
const pendingTranscriptFetches = new Map<string, Promise<ScrapeCreatorsResponse | null>>();

/**
 * Extract video info from ScrapeCreatorsResponse
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
  const cached = transcriptCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < TIMING.TRANSCRIPT_CACHE_TTL_MS) {
    return cached.data;
  }

  if (pendingTranscriptFetches.has(videoId)) {
    return pendingTranscriptFetches.get(videoId)!;
  }

  if (!apiKey?.trim()) {
    console.error("API key is missing or empty");
    return null;
  }

  const fetchPromise = (async () => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const requestUrl = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
    requestUrl.searchParams.set("url", youtubeUrl);
    requestUrl.searchParams.set("get_transcript", "true");

    for (let i = 0; i <= retries; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_BACKOFF_MULTIPLIER_MS * i));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMING.SCRAPE_API_TIMEOUT_MS);

      try {
        const response = await fetch(requestUrl.toString(), {
          headers: { "x-api-key": apiKey, "Accept": "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`API error (attempt ${i + 1}):`, errorText);
          if (response.status === 401 || response.status === 403) return null;
          continue;
        }

        const data = normalizeApiResponse(await response.json());
        transcriptCache.set(videoId, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        console.warn(`Fetch error (attempt ${i + 1}):`, error);
      }
    }
    return null;
  })();

  pendingTranscriptFetches.set(videoId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    pendingTranscriptFetches.delete(videoId);
  }
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
    if (forceRegenerate) transcriptCache.delete(videoId);

    const data = await fetchTranscript(videoId, scrapeCreatorsApiKey);
    if (!data?.transcript?.length) throw new Error(ERROR_MESSAGES.NO_TRANSCRIPT);

    const segments: SubtitleSegment[] = data.transcript.map(s => ({
      text: s.text,
      startTime: s.startMs,
      endTime: s.endMs,
      startTimeText: s.startTimeText || formatTimestamp(s.startMs),
    }));

    const refinedSegments = await refineTranscriptWithLLM(
      segments,
      data.title,
      data.description,
      openRouterApiKey,
      undefined,
      modelSelection,
      (prioritySegments) => {
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
            videoId,
            subtitles: prioritySegments,
            isPartial: true
          }).catch(() => {});
        }
      }
    );

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
        videoId,
        subtitles: refinedSegments,
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
    const storedAnalysis = await checkStoredAnalysis(videoId, modelSelection, targetLanguage, forceRegenerate);
    if (storedAnalysis) {
      return await broadcastStoredAnalysis(videoId, storedAnalysis);
    }

    const transcript_or_url = await resolveTranscriptSource(videoId, msgTranscript, transcriptCache);
    const videoInfo = await resolveVideoInfo(videoId, transcriptCache, extractVideoInfo, fetchTranscript, scrapeCreatorsApiKey);

    const result = await executeSummarizationWorkflow({
      transcript_or_url, videoId, scrapeCreatorsApiKey,
      analysis_model: modelSelection, quality_model: qualityModel || modelSelection,
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
