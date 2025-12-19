/**
 * Markdown generation utilities
 */

import { AnalysisData, VideoInfoResponse } from '@ui/services/types';
import { convertAnalysisChinese } from './utils';

/**
 * Generate markdown from analysis data
 */
export function generateAnalysisMarkdown(
  analysis: AnalysisData,
  videoInfo?: VideoInfoResponse
): string {
  const convertedAnalysis = convertAnalysisChinese(analysis);
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
  if (convertedAnalysis.summary) {
    markdown += `# Summary\n\n`;
    markdown += `${convertedAnalysis.summary}\n\n`;
  }

  // Add takeaways
  if (convertedAnalysis.takeaways && convertedAnalysis.takeaways.length > 0) {
    markdown += "# Key Takeaways\n\n";
    convertedAnalysis.takeaways.forEach(takeaway => {
      markdown += `- ${takeaway}\n`;
    });
    markdown += "\n";
  }

  // Add keywords
  if (convertedAnalysis.keywords && convertedAnalysis.keywords.length > 0) {
    markdown += "# Keywords\n\n";
    convertedAnalysis.keywords.forEach(keyword => {
      markdown += `- ${keyword}\n`;
    });
    markdown += "\n";
  }

  // Add chapters
  if (convertedAnalysis.chapters && convertedAnalysis.chapters.length > 0) {
    markdown += "# Video Chapters\n\n";
    convertedAnalysis.chapters.forEach(chapter => {
      markdown += `## ${chapter.header}\n\n`;
      markdown += `${chapter.summary}\n\n`;

      if (chapter.key_points && chapter.key_points.length > 0) {
        chapter.key_points.forEach(point => {
          markdown += `- ${point}\n`;
        });
        markdown += "\n";
      }
    });
  }

  return markdown;
}

