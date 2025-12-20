/**
 * URL validation and formatting utilities
 */

import { extractVideoId } from '@/lib/url';

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
  default: 'default',
  hq: 'hqdefault',
  mq: 'mqdefault',
  sd: 'sddefault',
  maxres: 'maxresdefault',
} as const;

export function getThumbnailUrl(
  videoId: string,
  quality: keyof typeof QUALITY_MAP = 'hq',
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
