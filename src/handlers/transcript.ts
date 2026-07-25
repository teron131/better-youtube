import { MESSAGE_ACTIONS } from "@/core/constants";
import { saveVideoMetadata } from "@/core/storage";
import { extractVideoInfo, fetchTranscript, getTranscriptText } from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";

type ScrapeResponse = {
  status: "success" | "error" | "skipped";
  message?: string;
  videoInfo?: ReturnType<typeof extractVideoInfo>;
  transcript?: string | null;
  hasTranscript?: boolean;
};

function sendScrapeFailure(
  sendResponse: (response: ScrapeResponse) => void,
  suppressErrors: boolean,
  message?: string,
): void {
  sendResponse({
    status: suppressErrors ? "skipped" : "error",
    message: suppressErrors ? undefined : message,
  });
}

/**
 * Handle scrape video request
 */
export async function handleScrapeVideo(
  message: ChromeMessage,
  ctx: { tabId?: number },
  sendResponse: (response: ScrapeResponse) => void,
): Promise<void> {
  const { videoId, suppressErrors } = message as unknown as {
    videoId: string;
    suppressErrors?: boolean;
  };

  try {
    const { tabId } = ctx;

    const data = await fetchTranscript(videoId, { tabId });
    if (!data) {
      sendScrapeFailure(
        sendResponse,
        suppressErrors === true,
        "Chrome transcript extraction did not return caption data.",
      );
      return;
    }

    const videoInfo = extractVideoInfo(data, videoId);
    await saveVideoMetadata(videoId, videoInfo);

    const transcriptText = data.transcript_only_text || getTranscriptText(data.transcript) || null;
    sendResponse({
      status: "success",
      videoInfo,
      transcript: transcriptText,
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
    if (!suppressErrors) {
      console.error("Scrape video error:", error);
    }
    sendScrapeFailure(
      sendResponse,
      suppressErrors === true,
      error instanceof Error ? error.message : "Failed to fetch video data",
    );
  }
}
