/**
 * Turns content-script video-change messages into watch URLs and asks the background to scrape the active tab's video for the side panel.
 */

import { MESSAGE_ACTIONS, TIMING } from "../../core/constants.ts";
import type { CaptionState, SubtitleSegment } from "../../core/storage.ts";
import type { VideoInfoResponse } from "../../core/types.ts";
import type { ChromeMessage } from "../../core/utils/chrome.ts";
import { getCurrentTab, sendChromeMessage } from "../../core/utils/chrome.ts";
import { createYouTubeWatchUrl, extractVideoId, getWatchVideoId } from "../../core/utils/url.ts";

export interface CurrentVideoFetchState {
  videoInfo: VideoInfoResponse | null;
  transcript: string | null;
  captionState: CaptionState | null;
  captionSegments: SubtitleSegment[];
}

type ScrapeVideoResponse = {
  status: "success" | "error" | "skipped";
  videoInfo?: VideoInfoResponse | null;
  transcript?: string | null;
  captionState?: CaptionState | null;
  captionSegments?: SubtitleSegment[];
  message?: string;
};

interface CurrentVideoFetchOptions {
  forceRefresh?: boolean;
  captionTrackId?: string;
  getCurrentTab?: typeof getCurrentTab;
  sendMessage?: typeof sendChromeMessage;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function currentVideoUrlFromMessage(message: ChromeMessage): string | null {
  if (message.action !== MESSAGE_ACTIONS.CURRENT_VIDEO_CHANGED) {
    return null;
  }

  const videoId = stringValue(message.videoId) ?? extractVideoId(stringValue(message.url) ?? "");
  return videoId ? createYouTubeWatchUrl(videoId) : null;
}

/** Resolves null when the active tab is not on this video or the scrape does not succeed; only an explicit caption-track request surfaces scrape errors. */
export async function fetchCurrentVideoState(
  videoId: string,
  options: CurrentVideoFetchOptions = {},
): Promise<CurrentVideoFetchState | null> {
  const resolveCurrentTab = options.getCurrentTab ?? getCurrentTab;
  const sendMessage = options.sendMessage ?? sendChromeMessage;
  const activeTab = await resolveCurrentTab();
  if (!activeTab?.id || getWatchVideoId(activeTab.url) !== videoId) return null;
  const response = await sendMessage<ScrapeVideoResponse>(
    {
      action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
      videoId,
      tabId: activeTab?.id,
      suppressErrors: true,
      ...(options.forceRefresh ? { forceRefresh: true } : {}),
      ...(options.captionTrackId
        ? { captionTrackId: options.captionTrackId, suppressErrors: false }
        : {}),
    },
    TIMING.SCRAPING_TIMEOUT_MS,
  );

  if (response.status !== "success") {
    if (response.status === "error" && options.captionTrackId) {
      throw new Error(response.message || "Unable to load caption track");
    }
    return null;
  }

  return {
    videoInfo: response.videoInfo ?? null,
    transcript: response.transcript ?? null,
    captionState: response.captionState ?? null,
    captionSegments: response.captionSegments ?? [],
  };
}
