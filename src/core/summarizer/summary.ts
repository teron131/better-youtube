import type { VideoMetadata } from "@/core/storage";

import type { GeminiVideoAnalysis } from "./geminiSchemas";

export type Chapter = {
  startTime?: string;
  endTime?: string;
  title: string;
  description: string;
};

export type Summary = {
  chapters: Chapter[];
  overallSummary: string;
};

export function toSummaryFromGemini(analysis: GeminiVideoAnalysis): Summary {
  return {
    overallSummary: analysis.overallSummary ?? "",
    chapters: (analysis.chapters ?? []).map((c) => ({
      startTime: c.startTime,
      endTime: c.endTime,
      title: c.title ?? "",
      description: c.description ?? "",
    })),
  };
}

export function toSummaryFromOpenRouter(summaryData: any): Summary {
  if (isSummary(summaryData)) return summaryData;

  const chaptersInput = Array.isArray(summaryData?.chapters)
    ? summaryData.chapters
    : [];

  const chapters: Chapter[] = chaptersInput
    .map((c: any) => {
      const header = typeof c?.header === "string" ? c.header : "";
      const summary = typeof c?.summary === "string" ? c.summary : "";
      const keyPoints = Array.isArray(c?.key_points)
        ? c.key_points.filter((x: unknown) => typeof x === "string")
        : [];

      const appended =
        keyPoints.length > 0
          ? `${summary}\n\nKey points:\n${keyPoints.map((p: string) => `- ${p}`).join("\n")}`
          : summary;

      return {
        title: header,
        description: appended,
      };
    })
    .filter((c: Chapter) => c.title || c.description);

  const overallSummary =
    typeof summaryData?.summary === "string" ? summaryData.summary : "";

  return {
    overallSummary,
    chapters: chapters.length
      ? chapters
      : [{ title: "", description: overallSummary }],
  };
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
