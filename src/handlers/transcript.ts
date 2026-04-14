import { MESSAGE_ACTIONS } from "@/core/constants";
import { saveVideoMetadata } from "@/core/storage";
import {
	extractVideoInfo,
	fetchTranscript,
	getTranscriptText,
} from "@/core/transcript";

import type { ChromeMessage } from "@/core/utils/chrome";

/**
 * Handle scrape video request
 */
export async function handleScrapeVideo(
	message: ChromeMessage,
	ctx: { tabId?: number },
	sendResponse: (response: any) => void,
): Promise<void> {
	try {
		const { videoId } = message as any;
		const { tabId } = ctx;

		const data = await fetchTranscript(videoId, {
			tabId,
		});
		if (!data) {
			sendResponse({
				status: "error",
				message: "Chrome transcript extraction did not return caption data.",
			});
			return;
		}

		const videoInfo = extractVideoInfo(data, videoId);
		await saveVideoMetadata(videoId, videoInfo);

		const transcriptText =
			data.transcript_only_text || getTranscriptText(data.transcript) || null;
		sendResponse({
			status: "success",
			videoInfo,
			hasTranscript: !!transcriptText,
		});

		chrome.runtime
			.sendMessage({
				action: MESSAGE_ACTIONS.SCRAPE_VIDEO_COMPLETED,
				videoId,
				videoInfo,
				transcript: transcriptText,
			})
			.catch(() => {});
	} catch (error) {
		console.error("Scrape video error:", error);
		sendResponse({
			status: "error",
			message:
				error instanceof Error ? error.message : "Failed to fetch video data",
		});
	}
}
