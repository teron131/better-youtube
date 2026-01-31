/*
 * Markdown generation utilities
 */

import { Summary, VideoInfoResponse } from "@/core/types";
import { convertSummaryChinese } from "./text";

/**
 * Generate markdown from summary data
 */
export function generateSummaryMarkdown(
  summary: Summary,
  videoInfo?: VideoInfoResponse,
): string {
  const convertedSummary = convertSummaryChinese(summary);
  let markdown = "";

  // Add video info if available
  if (videoInfo) {
    if (videoInfo.url) {
      markdown += `**URL:** ${String(videoInfo.url)}\n\n`;
    }
    if (videoInfo.title) {
      markdown += `**Title:** ${String(videoInfo.title)}\n\n`;
    }
    if (videoInfo.thumbnail) {
      markdown += `**Thumbnail:** ${String(videoInfo.thumbnail)}\n\n`;
    }
    if (videoInfo.author) {
      markdown += `**Channel:** ${String(videoInfo.author)}\n\n`;
    }
    if (markdown) {
      markdown += "\n";
    }
  }

  // Add summary
  if (convertedSummary.overallSummary) {
    markdown += `# Summary\n\n`;
    markdown += `${convertedSummary.overallSummary}\n\n`;
  }

  // Add chapters
  if (convertedSummary.chapters && convertedSummary.chapters.length > 0) {
    markdown += "# Video Chapters\n\n";
    convertedSummary.chapters.forEach((chapter) => {
      const timeRange =
        chapter.startTime || chapter.endTime
          ? ` (${[chapter.startTime, chapter.endTime].filter(Boolean).join("-")})`
          : "";
      markdown += `## ${chapter.title}${timeRange}\n\n`;
      markdown += `${chapter.description}\n\n`;
    });
  }

  return markdown;
}
