/**
 * Background Script
 * Handles API calls, message routing, and orchestrates the refinement/summarization process.
 */

import { MESSAGE_ACTIONS } from "@/core/constants";
import {
	loadRuntimeConfigSnapshot,
	type RuntimeConfigSnapshot,
} from "@/core/runtimeConfig";
import { createMessageListener } from "@/core/utils/chrome";
import { handleFetchSubtitles } from "./refine";
import { handleExtractSubscriptions } from "./subscriptions";
import { handleGenerateSummary } from "./summary";
import { handleScrapeVideo } from "./transcript";

const captionRequests = new Map<string, string>();
const summaryRequests = new Map<string, string>();
const latestCaptionWorkloads = new Map<string, string>();
const latestSummaryWorkloads = new Map<string, string>();
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
	const tabId =
		typeof message.tabId === "number" ? message.tabId : sender.tab?.id;

	switch (message.action) {
		case MESSAGE_ACTIONS.GET_VIDEO_TITLE:
			sendResponse({
				status: "error",
				message: "Use content script for title",
			});
			return false;

		case MESSAGE_ACTIONS.SCRAPE_VIDEO:
			void handleScrapeVideo(message, { tabId }, sendResponse).catch(
				(error) => {
					console.error(`[handlers] ${message.action} failed`, error);
				},
			);
			return true;

		case MESSAGE_ACTIONS.FETCH_SUBTITLES:
			void handleFetchSubtitles(
				message,
				{
					tabId,
					captionRequests,
					latestCaptionWorkloads,
					pendingCaptionJobs,
				},
				sendResponse,
			).catch((error) => {
				console.error(`[handlers] ${message.action} failed`, error);
			});
			return true;

		case MESSAGE_ACTIONS.GENERATE_SUMMARY: {
			(async () => {
				let config: RuntimeConfigSnapshot;
				try {
					config = await loadRuntimeConfigSnapshot();
				} catch (error) {
					console.error("[handlers] failed to load runtime config", error);
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
							summaryRequests,
							latestSummaryWorkloads,
							pendingSummaryJobs,
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
