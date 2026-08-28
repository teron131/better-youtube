/** Validates summary-shaped values and renders the shared persisted summary contract as Markdown. */

import type { VideoMetadata } from "@/core/storage";
import type { Summary } from "@/core/types";

function coerceSummary(value: unknown): Summary | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const chapters = Array.isArray(v.chapters) ? v.chapters : null;
  if (!chapters) return null;

  if (typeof v.overview === "string") {
    return { overview: v.overview, chapters } as Summary;
  }

  return null;
}

export function parseLlmSummary(summary: unknown): Summary {
  const coerced = coerceSummary(summary);
  if (coerced) return coerced;
  throw new Error("Invalid summary shape from LLM");
}

export function summaryToMarkdown(summary: Summary, videoInfo?: VideoMetadata | null): string {
  const parts: string[] = [];

  const normalized = coerceSummary(summary) ?? summary;

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
