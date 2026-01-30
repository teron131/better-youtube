/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { ChromeMessage, createMessageListener } from "@/core/utils/chrome";
import { MESSAGE_ACTIONS } from "@/core/constants";
import { handleFetchSubtitles } from "./refine";
import { handleGenerateSummary } from "./summary";
import { handleScrapeVideo } from "./transcript";

const latestCaptionRequestByVideo = new Map<string, string>();
const latestSummaryRequestByVideo = new Map<string, string>();
const pendingCaptionJobs = new Map<string, Promise<void>>();
const pendingSummaryJobs = new Map<string, Promise<void>>();

// Allow side panel to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

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
      handleFetchSubtitles(
        message,
        { tabId, latestCaptionRequestByVideo, pendingCaptionJobs },
        sendResponse,
      );
      return true;

    case MESSAGE_ACTIONS.GENERATE_SUMMARY:
      handleGenerateSummary(
        message,
        { latestSummaryRequestByVideo, pendingSummaryJobs },
        sendResponse,
      );
      return true;

    case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
      sendResponse({
        status: "error",
        message: "Use content script for title",
      });
      return false;

    default:
      return false;
  }
});
