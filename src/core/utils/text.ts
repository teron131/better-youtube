import type { SubtitleSegment } from "@/core/storage";
import type { Summary, VideoInfoResponse } from "@/core/types";
import * as OpenCC from "opencc-js";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
  subtitles: SubtitleSegment[],
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
function convertSummaryChineseFieldwise(summary: Summary): Summary {
  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];
  return {
    ...summary,
    overview: s2tw(summary.overview || ""),
    chapters: chapters.map((c) => ({
      ...c,
      title: s2tw(c.title || ""),
      description: s2tw(c.description || ""),
    })),
  };
}

export function convertSummaryChinese(summary: Summary): Summary {
  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];

  const converted: Summary = {
    ...summary,
    overview: summary.overview || "",
    chapters: chapters.length
      ? chapters.map((c) => ({
          ...c,
          title: c.title || "",
          description: c.description || "",
        }))
      : [],
  };

  const parts: string[] = [];
  const targets: Array<{ container: any; key: string | number }> = [];
  const pushTarget = (
    container: any,
    key: string | number,
    value: string | null | undefined,
  ) => {
    parts.push(value || "");
    targets.push({ container, key });
  };

  pushTarget(converted, "overview", converted.overview);

  converted.chapters.forEach((c) => {
    pushTarget(c, "title", c.title);
    pushTarget(c, "description", c.description);
  });

  const separator = "\u001F";
  const convertedText = s2tw(parts.join(separator));
  const convertedParts = convertedText.split(separator);

  if (convertedParts.length !== parts.length) {
    return convertSummaryChineseFieldwise(summary);
  }

  convertedParts.forEach((part, index) => {
    const target = targets[index];
    if (!target) return;
    target.container[target.key] = part;
  });

  return converted;
}

/**
 * Convert video info text fields to traditional Chinese (Taiwan variant)
 * Only converts the final display fields
 */
export function convertVideoInfoChinese(
  videoInfo: VideoInfoResponse,
): VideoInfoResponse {
  return {
    ...videoInfo,
    title: videoInfo.title ? s2tw(videoInfo.title) : videoInfo.title,
    author: videoInfo.author ? s2tw(videoInfo.author) : videoInfo.author,
  };
}
