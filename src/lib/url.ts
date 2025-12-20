/**
 * URL Utility Functions
 */

/**
 * Extract video ID from YouTube URL
 * Supports both youtube.com and youtu.be formats
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.replace(/^www\./, "");

    // youtube.com format
    if (host.includes("youtube.com")) {
      const v = urlObj.searchParams.get("v");
      if (v) return v;
    }

    // youtu.be format
    if (host === "youtu.be") {
      const id = urlObj.pathname.replace(/^\//, "");
      if (id) return id;
    }
  } catch (e) {
    // Fallback regex for partial or malformed URLs
    const match = url.match(/(?:v=|youtu\.be\/)([\w-]+)/);
    if (match && match[1]) return match[1];
  }

  return null;
}

/**
 * Clean YouTube URL to extract only video ID and essential parameters
 */
export function cleanYouTubeUrl(originalUrl: string): string {
  try {
    const url = new URL(originalUrl);
    const videoId = url.searchParams.get("v");
    if (videoId) {
      return `${url.protocol}//${url.hostname}${url.pathname}?v=${videoId}`;
    }
  } catch (e) {
    console.error("Error parsing URL:", originalUrl, e);
  }
  return originalUrl;
}
