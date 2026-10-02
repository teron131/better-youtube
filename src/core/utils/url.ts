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

export function createYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Identifies a playable watch page without accepting lookalike hosts or non-video YouTube pages. */
export function getWatchVideoId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const page = new URL(url);
    if (page.hostname !== "youtube.com" && !page.hostname.endsWith(".youtube.com")) return null;
    if (page.pathname !== "/watch") return null;
    const id = page.searchParams.get("v");
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
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

export function getThumbnailUrl(videoId: string, quality: keyof typeof QUALITY_MAP = "hq"): string {
  return `https://img.youtube.com/vi/${videoId}/${QUALITY_MAP[quality]}.jpg`;
}
