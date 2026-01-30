import { MESSAGE_ACTIONS } from "@/core/constants";
import { saveVideoMetadata } from "@/core/storage";
import { extractVideoInfo, fetchTranscript } from "@/core/transcript";

import type { ChromeMessage } from "@/core/utils/chrome";

/**
 * Handle scrape video request
 */
export async function handleScrapeVideo(
  message: ChromeMessage,
  sendResponse: (response: any) => void,
): Promise<void> {
  const { videoId } = message as any;

  const data = await fetchTranscript(videoId);
  if (!data) {
    sendResponse({
      status: "error",
      message: "Failed to fetch video data (Check API Key)",
    });
    return;
  }

  const videoInfo = extractVideoInfo(data, videoId);
  await saveVideoMetadata(videoId, videoInfo);

  const transcriptText =
    data.transcript_only_text ||
    data.transcript?.map((s: any) => s.text).join(" ") ||
    null;
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
}
