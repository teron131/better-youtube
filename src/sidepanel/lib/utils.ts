/**
 * General utility functions including Tailwind class merging and Chinese text conversion.
 */

import { s2tw } from "@/lib/captionConversion";
import { SummaryData, VideoInfoResponse } from "@ui/services/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { s2tw };

/**
 * Convert summary text fields to traditional Chinese (Taiwan variant)
 * Only converts the final results that are displayed to the user
 */
function convertSummaryChineseFieldwise(summary: SummaryData): SummaryData {
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

export function convertSummaryChinese(summary: SummaryData): SummaryData {
  const takeaways = Array.isArray(summary.takeaways) ? summary.takeaways : [];
  const keywords = Array.isArray(summary.keywords) ? summary.keywords : [];
  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];

  const converted: SummaryData = {
    ...summary,
    title: summary.title || "",
    summary: summary.summary || "",
    takeaways: takeaways.length ? [...takeaways] : [],
    keywords: keywords.length ? [...keywords] : [],
    chapters: chapters.length
      ? chapters.map((chapter) => ({
          ...chapter,
          header: chapter.header || "",
          summary: chapter.summary || "",
          key_points: Array.isArray(chapter.key_points) ? [...chapter.key_points] : [],
        }))
      : [],
  };

  const parts: string[] = [];
  const targets: Array<{ container: any; key: string | number }> = [];
  const pushTarget = (container: any, key: string | number, value: string | null | undefined) => {
    parts.push(value || "");
    targets.push({ container, key });
  };

  pushTarget(converted, "title", converted.title);
  pushTarget(converted, "summary", converted.summary);

  converted.takeaways.forEach((takeaway, index) => {
    pushTarget(converted.takeaways, index, takeaway);
  });

  converted.keywords.forEach((keyword, index) => {
    pushTarget(converted.keywords, index, keyword);
  });

  converted.chapters.forEach((chapter) => {
    pushTarget(chapter, "header", chapter.header);
    pushTarget(chapter, "summary", chapter.summary);
    chapter.key_points.forEach((point, pointIndex) => {
      pushTarget(chapter.key_points, pointIndex, point);
    });
  });

  const separator = "\u001F";
  const convertedText = s2tw(parts.join(separator));
  const convertedParts = convertedText.split(separator);

  if (convertedParts.length !== parts.length) {
    return convertSummaryChineseFieldwise(summary);
  }

  for (let i = 0; i < convertedParts.length; i += 1) {
    const target = targets[i];
    target.container[target.key] = convertedParts[i];
  }

  return converted;
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
