/** Video and validation helper functions */

import { MESSAGE_ACTIONS } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import { sendChromeMessage } from "@/core/utils/chrome";
import { extractVideoId } from "@/core/utils/url";

type AutoGenScrapeResponse = {
	status: string;
	message?: string;
};

const AUTO_GEN_SCRAPE_FALLBACK: AutoGenScrapeResponse = {
	status: "skipped",
	message: "Request failed",
};

export function isCurrentVideo(videoId: string): boolean {
	return extractVideoId(window.location.href) === videoId;
}

export function validateLoadContext(): { isValid: boolean; videoId?: string } {
	if (!window.location.href.includes("youtube.com/watch")) {
		console.log("Not on a video page, skipping subtitle load.");
		return { isValid: false };
	}
	const videoId = extractVideoId(window.location.href);
	if (!videoId) {
		console.warn("Could not extract video ID, skipping subtitle load.");
		return { isValid: false };
	}
	return { isValid: true, videoId };
}

export async function executeScrapeForAutoGen(
	videoId: string,
): Promise<boolean> {
	console.log(`[Auto-gen] Step 1: Scraping video data for ${videoId}...`);
	const result = await sendChromeMessage<AutoGenScrapeResponse>({
		action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
		videoId,
		requestId: createRequestId("scrape"),
		suppressErrors: true,
	}).catch(() => AUTO_GEN_SCRAPE_FALLBACK);
	if (result.status !== "success") {
		console.log(
			`[Auto-gen] Scrape skipped for ${videoId}; stopping auto-caption generation.`,
		);
		return false;
	}
	console.log(
		`[Auto-gen] Step 2: Scrape complete. Starting refine + summarize...`,
	);
	return true;
}

export function determineToggleState(message: any): boolean {
	if ("showSubtitles" in message) {
		return message.showSubtitles !== false;
	}
	if ("enabled" in message) {
		return message.enabled !== false;
	}
	return true;
}
