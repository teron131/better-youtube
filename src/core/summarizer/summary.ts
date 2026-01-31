import type { VideoMetadata } from "@/core/storage";
import type { Summary } from "@/core/types";

export function toSummaryFromGemini(summary: unknown): Summary {
  if (isSummary(summary)) return summary;
  throw new Error("Invalid summary shape from Gemini");
}

export function toSummaryFromOpenRouter(summary: unknown): Summary {
  if (isSummary(summary)) return summary;
  throw new Error("Invalid summary shape from OpenRouter");
}

export function isSummary(value: unknown): value is Summary {
  if (!value || typeof value !== "object") return false;
  const v = value as any;
  if (typeof v.overallSummary !== "string") return false;
  if (!Array.isArray(v.chapters)) return false;
  return true;
}

export function formatSummaryAsMarkdown(
  summary: Summary,
  videoInfo?: VideoMetadata | null,
): string {
  const parts: string[] = [];

  if (videoInfo) {
    if (videoInfo.url) parts.push(`**URL:** ${String(videoInfo.url)}\n`);
    if (videoInfo.title) parts.push(`**Title:** ${String(videoInfo.title)}\n`);
    if (videoInfo.thumbnail)
      parts.push(`**Thumbnail:** ${String(videoInfo.thumbnail)}\n`);
    if (videoInfo.author)
      parts.push(`**Channel:** ${String(videoInfo.author)}\n`);
    if (parts.length) parts.push("\n");
  }

  if (summary.overallSummary) {
    parts.push("# Summary\n\n", summary.overallSummary.trim(), "\n\n");
  }

  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];
  if (chapters.length) {
    parts.push("# Video Chapters\n\n");
    chapters.forEach((c) => {
      const timeRange =
        c.startTime || c.endTime
          ? ` (${[c.startTime, c.endTime].filter(Boolean).join("-")})`
          : "";
      const title = (c.title || "").trim();
      parts.push(`## ${title || "Chapter"}${timeRange}\n\n`);
      if (c.description) parts.push(String(c.description).trim(), "\n\n");
    });
  }

  return parts.join("");
}
