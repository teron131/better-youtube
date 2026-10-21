/** Service-worker entry: routes runtime messages to feature handlers and owns the caption and summary workload lifecycles. */

import { CHAT_ACTION } from "@/core/agent/conversation";
import { type AppConfig, loadConfig } from "@/core/config";
import { MESSAGE_ACTIONS } from "@/core/constants";
import { createMessageListener } from "@/core/utils/chrome";
import { fetchAggregateSources } from "@/sidepanel/services/model-stats/leaderboards";

import { handleFetchSubtitles } from "./captions";
import { cancelVideoChat, handleVideoChat } from "./chat";
import { registerContentScriptBootstrap } from "./contentScripts";
import { handleExtractSubscriptions } from "./subscriptions";
import { handleGenerateSummary } from "./summary";
import { handleScrapeVideo } from "./video";
import { VideoWorkloadLifecycle } from "./workloads";

const captionWorkloads = new VideoWorkloadLifecycle();
const summaryWorkloads = new VideoWorkloadLifecycle();

registerContentScriptBootstrap();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// The content script records hidden recommendation cards in session storage, which is closed to content scripts by default.
if (chrome.storage.session) {
  chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
    .catch((error) => {
      console.error("[handlers] failed to expose session storage", error);
    });
}

createMessageListener((message, sender, sendResponse) => {
  const tabId = typeof message.tabId === "number" ? message.tabId : sender.tab?.id;

  switch (message.action) {
    case MESSAGE_ACTIONS.FETCH_MODEL_QUALITY_SOURCES:
      void fetchAggregateSources().then(sendResponse);
      return true;

    case MESSAGE_ACTIONS.CANCEL_VIDEO_REQUEST:
      if (typeof message.videoId === "string" && typeof message.requestId === "string") {
        if (message.kind === "chat") cancelVideoChat(message.videoId, message.requestId);
        if (message.kind === "summary") summaryWorkloads.cancel(message.videoId, message.requestId);
      }
      sendResponse({ status: "cancelled" });
      return false;
    case CHAT_ACTION:
      void handleVideoChat(message).then(sendResponse, (error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Video chat failed.",
        });
      });
      return true;
    case MESSAGE_ACTIONS.SCRAPE_VIDEO:
      void handleScrapeVideo(message, { tabId, captionWorkloads }, sendResponse).catch((error) => {
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
