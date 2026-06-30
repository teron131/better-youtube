/**
 * Side panel helpers for active YouTube video navigation and fetching.
 */

import { MESSAGE_ACTIONS } from "../../core/constants.ts";
import type { VideoInfoResponse } from "../../core/types.ts";
import type { ChromeMessage } from "../../core/utils/chrome.ts";
import { getCurrentTab, sendChromeMessage } from "../../core/utils/chrome.ts";
import { createYouTubeWatchUrl, extractVideoId } from "../../core/utils/url.ts";

export interface CurrentVideoFetchState {
	videoInfo: VideoInfoResponse | null;
	transcript: string | null;
}

type ScrapeVideoResponse = {
	status: "success" | "error" | "skipped";
	videoInfo?: VideoInfoResponse | null;
	transcript?: string | null;
};

interface CurrentVideoFetchDependencies {
	getCurrentTab?: typeof getCurrentTab;
	sendMessage?: typeof sendChromeMessage;
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

export function currentVideoUrlFromMessage(
	message: ChromeMessage,
): string | null {
	if (message.action !== MESSAGE_ACTIONS.CURRENT_VIDEO_CHANGED) {
		return null;
	}

	const videoId =
		stringValue(message.videoId) ??
		extractVideoId(stringValue(message.url) ?? "");
	return videoId ? createYouTubeWatchUrl(videoId) : null;
}

export async function fetchCurrentVideoState(
	videoId: string,
	dependencies: CurrentVideoFetchDependencies = {},
): Promise<CurrentVideoFetchState | null> {
	const resolveCurrentTab = dependencies.getCurrentTab ?? getCurrentTab;
	const sendMessage = dependencies.sendMessage ?? sendChromeMessage;
	const activeTab = await resolveCurrentTab();
	const response = await sendMessage<ScrapeVideoResponse>({
		action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
		videoId,
		tabId: activeTab?.id,
		suppressErrors: true,
	});

	if (response.status !== "success") {
		return null;
	}

	return {
		videoInfo: response.videoInfo ?? null,
		transcript: response.transcript ?? null,
	};
}
