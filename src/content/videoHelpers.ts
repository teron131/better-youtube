/** Video and validation helper functions */

import { MESSAGE_ACTIONS } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import { sendChromeMessage } from "@/core/utils/chrome";
import { extractVideoId } from "@/core/utils/url";

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
  const result = await sendChromeMessage<{ status: string }>({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
    videoId,
    requestId: createRequestId("scrape"),
  }).catch(() => ({ status: "error" }));
  if (result.status !== "success") {
    console.error(`[Auto-gen] Scrape failed for ${videoId}`);
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
