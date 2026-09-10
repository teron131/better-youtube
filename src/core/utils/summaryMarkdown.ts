/** Renders persisted summaries and optional video metadata for background responses. */

import type { VideoMetadata } from "@/core/storage";
import type { Summary } from "@/core/types";

export function summaryToMarkdown(summary: Summary, videoInfo?: VideoMetadata | null): string {
  const parts: string[] = [];

  const normalized = summary;

  if (videoInfo) {
    if (videoInfo.url) parts.push(`**URL:** ${String(videoInfo.url)}\n`);
    if (videoInfo.title) parts.push(`**Title:** ${String(videoInfo.title)}\n`);
    if (videoInfo.thumbnail) parts.push(`**Thumbnail:** ${String(videoInfo.thumbnail)}\n`);
    if (videoInfo.author) parts.push(`**Channel:** ${String(videoInfo.author)}\n`);
    if (parts.length) parts.push("\n");
  }

  if (normalized.overview) {
    parts.push("# Summary\n\n", normalized.overview.trim(), "\n\n");
  }

  const chapters = Array.isArray(normalized.chapters) ? normalized.chapters : [];
  if (chapters.length) {
    parts.push("# Video Chapters\n\n");
    chapters.forEach((c) => {
      const timeRange =
        c.startTime || c.endTime ? ` (${[c.startTime, c.endTime].filter(Boolean).join("-")})` : "";
      const title = (c.title || "").trim();
      parts.push(`## ${title || "Chapter"}${timeRange}\n\n`);
      if (c.description) parts.push(String(c.description).trim(), "\n\n");
    });
  }

  return parts.join("");
}
