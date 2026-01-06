/**
 * General utility functions including Tailwind class merging and Chinese text conversion.
 */

import { SummaryData, VideoInfoResponse } from "@ui/services/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { s2tw } from "@/lib/captionConversion";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { s2tw };

/**
 * Convert summary text fields to traditional Chinese (Taiwan variant)
 * Only converts the final results that are displayed to the user
 */
export function convertSummaryChinese(summary: SummaryData): SummaryData {
  const takeaways = Array.isArray(summary.takeaways) ? summary.takeaways : [];
  const keywords = Array.isArray(summary.keywords) ? summary.keywords : [];
  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];

  return {
    ...summary,
    title: s2tw(summary.title || ''),
    summary: s2tw(summary.summary || ''),
    takeaways: takeaways.map(s2tw),
    keywords: keywords.map(s2tw),
    chapters: chapters.map(chapter => ({
      ...chapter,
      header: s2tw(chapter.header || ''),
      summary: s2tw(chapter.summary || ''),
      key_points: (Array.isArray(chapter.key_points) ? chapter.key_points : []).map(s2tw),
    })),
  };
}

/**
 * Convert video info text fields to traditional Chinese (Taiwan variant)
 * Only converts the final display fields
 */
export function convertVideoInfoChinese(videoInfo: VideoInfoResponse): VideoInfoResponse {
  return {
    ...videoInfo,
    title: videoInfo.title ? s2tw(videoInfo.title) : videoInfo.title,
    author: videoInfo.author ? s2tw(videoInfo.author) : videoInfo.author,
  };
}
