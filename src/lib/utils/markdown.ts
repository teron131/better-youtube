/**
 * Markdown generation utilities
 */

import { SummaryData, VideoInfoResponse } from "@/lib/core/types";
import { convertSummaryChinese } from "./text";

/**
 * Generate markdown from summary data
 */
export function generateSummaryMarkdown(
  summary: SummaryData,
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
  if (convertedSummary.summary) {
    markdown += `# Summary\n\n`;
    markdown += `${convertedSummary.summary}\n\n`;
  }

  // Add takeaways
  if (convertedSummary.takeaways && convertedSummary.takeaways.length > 0) {
    markdown += "# Key Takeaways\n\n";
    convertedSummary.takeaways.forEach((takeaway) => {
      markdown += `- ${takeaway}\n`;
    });
    markdown += "\n";
  }

  // Add keywords
  if (convertedSummary.keywords && convertedSummary.keywords.length > 0) {
    markdown += "# Keywords\n\n";
    convertedSummary.keywords.forEach((keyword) => {
      markdown += `- ${keyword}\n`;
    });
    markdown += "\n";
  }

  // Add chapters
  if (convertedSummary.chapters && convertedSummary.chapters.length > 0) {
    markdown += "# Video Chapters\n\n";
    convertedSummary.chapters.forEach((chapter) => {
      markdown += `## ${chapter.header}\n\n`;
      markdown += `${chapter.summary}\n\n`;

      if (chapter.key_points && chapter.key_points.length > 0) {
        chapter.key_points.forEach((point) => {
          markdown += `- ${point}\n`;
        });
        markdown += "\n";
      }
    });
  }

  return markdown;
}
