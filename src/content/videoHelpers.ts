/** Watch-page checks and caption scraping for display and automatic refinement. */

import { MESSAGE_ACTIONS, TIMING } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import { sendChromeMessage } from "@/core/utils/chrome";
import { extractVideoId } from "@/core/utils/url";

type ScrapeResponse = {
  status: string;
};

const SCRAPE_FALLBACK: ScrapeResponse = {
  status: "skipped",
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

export async function scrapeVideoCaptions(videoId: string): Promise<boolean> {
  const result = await sendChromeMessage<ScrapeResponse>(
    {
      action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
      videoId,
      requestId: createRequestId("scrape"),
      suppressErrors: true,
    },
    TIMING.SCRAPING_TIMEOUT_MS,
  ).catch(() => SCRAPE_FALLBACK);
  return result.status === "success";
}
