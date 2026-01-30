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

    if (host.includes("youtube.com")) {
      const v = urlObj.searchParams.get("v");
      if (v) return v;
    }
    if (host === "youtu.be") {
      const id = urlObj.pathname.replace(/^\//, "");
      if (id) return id;
    }
  } catch {
    const match = url.match(/(?:v=|youtu\.be\/)([\w-]+)/);
    if (match?.[1]) return match[1];
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

/**
 * Validate YouTube URL format
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.length === 0 ||
    trimmed.includes("youtube.com") ||
    trimmed.includes("youtu.be")
  );
}

/**
 * Clean and normalize YouTube URL
 */
export function cleanVideoUrl(input?: string | null): string | null {
  if (!input) return null;
  const videoId = extractVideoId(input);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : input;
}

/**
 * Get video thumbnail URL
 */
const QUALITY_MAP = {
  default: "default",
  hq: "hqdefault",
  mq: "mqdefault",
  sd: "sddefault",
  maxres: "maxresdefault",
} as const;

export function getThumbnailUrl(
  videoId: string,
  quality: keyof typeof QUALITY_MAP = "hq",
): string {
  return `https://img.youtube.com/vi/${videoId}/${QUALITY_MAP[quality]}.jpg`;
}

/**
 * Example YouTube URLs for demonstration
 */
export const EXAMPLE_YOUTUBE_URLS = [
  "https://youtu.be/...",
  "https://youtube.com/watch?v=...",
] as const;
