import type { SubtitleSegment } from '@/lib/core/storage';
import { SummaryData, VideoInfoResponse } from '@/lib/core/types';
import * as OpenCC from 'opencc-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const converterCN2TW = OpenCC.Converter({ from: "cn", to: "tw" });
const CHINESE_CHAR_REGEX = /[\u4E00-\u9FFF]/;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts simplified Chinese to traditional Chinese
 */
export function s2tw(content: string): string {
  if (!content) return content;
  if (!CHINESE_CHAR_REGEX.test(content)) return content;
  try {
    return converterCN2TW(content);
  } catch (error) {
    console.warn("Chinese conversion (CN->TW) failed:", error);
    return content;
  }
}

/**
 * Convert subtitles to traditional Chinese
 * Batch processes all segments for performance
 */
export function convertSubtitlesToTraditionalChinese(
  subtitles: SubtitleSegment[]
): SubtitleSegment[] {
  if (!subtitles || subtitles.length === 0) return subtitles;

  const separator = "\u0001";
  const joined = subtitles.map((segment) => segment.text || "").join(separator);
  const converted = s2tw(joined);
  const parts = converted.split(separator);

  if (parts.length !== subtitles.length) {
    return subtitles.map((segment) => ({
      ...segment,
      text: s2tw(segment.text),
    }));
  }

  return subtitles.map((segment, index) => ({
    ...segment,
    text: parts[index] ?? "",
  }));
}

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
