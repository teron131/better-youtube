/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { type AppConfig, loadConfig } from "@/core/config";
import { MESSAGE_ACTIONS } from "@/core/constants";
import { createMessageListener } from "@/core/utils/chrome";

import { registerContentScriptBootstrap } from "./contentScriptBootstrap";
import { handleFetchSubtitles } from "./refine";
import { handleExtractSubscriptions } from "./subscriptions";
import { handleGenerateSummary } from "./summary";
import { handleScrapeVideo } from "./transcript";
import { VideoWorkloadLifecycle } from "./workflow";

const captionWorkloads = new VideoWorkloadLifecycle();
const summaryWorkloads = new VideoWorkloadLifecycle();

registerContentScriptBootstrap();

// Allow side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

if (chrome.storage.session) {
  chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
    .catch((error) => {
      console.error("[handlers] failed to expose session storage", error);
    });
}

/**
 * Main message listener
 */
createMessageListener((message, sender, sendResponse) => {
  const tabId = typeof message.tabId === "number" ? message.tabId : sender.tab?.id;

  switch (message.action) {
    case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
      sendResponse({
        status: "error",
        message: "Use content script for title",
      });
      return false;

    case MESSAGE_ACTIONS.SCRAPE_VIDEO:
      void handleScrapeVideo(message, { tabId }, sendResponse).catch((error) => {
        console.error(`[handlers] ${message.action} failed`, error);
      });
      return true;

    case MESSAGE_ACTIONS.FETCH_SUBTITLES:
      void handleFetchSubtitles(
        message,
        {
          tabId,
          captionWorkloads,
        },
        sendResponse,
      ).catch((error) => {
        console.error(`[handlers] ${message.action} failed`, error);
      });
      return true;

    case MESSAGE_ACTIONS.GENERATE_SUMMARY: {
      (async () => {
        let config: AppConfig;
        try {
          config = await loadConfig();
        } catch (error) {
          console.error("[handlers] failed to load configuration", error);
          sendResponse({
            status: "error",
            message: "Failed to load configuration",
          });
          return;
        }

        try {
          await handleGenerateSummary(
            message,
            {
              tabId,
              summaryWorkloads,
              config,
            },
            sendResponse,
          );
        } catch (error) {
          console.error(`[handlers] ${message.action} failed`, error);
        }
      })();

      return true;
    }

    case MESSAGE_ACTIONS.EXTRACT_SUBSCRIPTIONS:
      void handleExtractSubscriptions(message, sendResponse);
      return true;

    default:
      return false;
  }
});
