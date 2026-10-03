/** Resolves the active tab's YouTube watch page for sidepanel video syncing. */

import { createYouTubeWatchUrl, getWatchVideoId } from "@/core/utils/url";

/**
 * Get current YouTube video tab
 */
export async function getCurrentVideoTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      resolve(getWatchVideoId(currentTab?.url) ? currentTab : null);
    });
  });
}

/** Returns the canonical watch URL of the active tab's video, or an empty string. */
export async function getCurrentVideoUrl(): Promise<string> {
  try {
    const videoId = getWatchVideoId((await getCurrentVideoTab())?.url);
    if (videoId) return createYouTubeWatchUrl(videoId);
  } catch (error) {
    console.error("Error getting video ID from tab:", error);
  }

  return "";
}
