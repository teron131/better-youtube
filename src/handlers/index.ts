/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { MESSAGE_ACTIONS } from "@/core/constants";
import { initGlobalConfig, clearConfigCache } from "@/core/runtimeConfig";
import { createMessageListener } from "@/core/utils/chrome";
import { handleFetchSubtitles } from "./refine";
import { handleGenerateSummary } from "./summary";
import { handleScrapeVideo } from "./transcript";

const captionRequests = new Map<string, string>();
const summaryRequests = new Map<string, string>();
const latestCaptionWorkloads = new Map<string, string>();
const latestSummaryWorkloads = new Map<string, string>();
const pendingCaptionJobs = new Map<string, Promise<void>>();
const pendingSummaryJobs = new Map<string, Promise<void>>();
type AsyncActionHandler = () => Promise<void>;

// Allow side panel to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

/**
 * Main message listener
 */
createMessageListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  const actionHandlers: Partial<Record<string, AsyncActionHandler>> = {
    [MESSAGE_ACTIONS.SCRAPE_VIDEO]: () =>
      handleScrapeVideo(message, sendResponse),
    [MESSAGE_ACTIONS.FETCH_SUBTITLES]: () =>
      handleFetchSubtitles(
        message,
        {
          tabId,
          captionRequests,
          latestCaptionWorkloads,
          pendingCaptionJobs,
        },
        sendResponse,
      ),
    [MESSAGE_ACTIONS.GENERATE_SUMMARY]: () =>
      handleGenerateSummary(
        message,
        { summaryRequests, latestSummaryWorkloads, pendingSummaryJobs },
        sendResponse,
      ),
  };

  switch (message.action) {
    case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
      sendResponse({
        status: "error",
        message: "Use content script for title",
      });
      return false;

    case MESSAGE_ACTIONS.SCRAPE_VIDEO:
    case MESSAGE_ACTIONS.FETCH_SUBTITLES:
    case MESSAGE_ACTIONS.GENERATE_SUMMARY: {
      const runAction = actionHandlers[message.action];
      if (!runAction) {
        return false;
      }
      (async () => {
        try {
          await initGlobalConfig();
          await runAction();
        } finally {
          clearConfigCache();
        }
      })();

      return true;
    }

    default:
      return false;
  }
});
