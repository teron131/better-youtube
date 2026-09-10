/** Shared class-name utilities and Traditional Chinese conversion for displayed text and captions. */

import { type ClassValue, clsx } from "clsx";
import * as OpenCC from "opencc-js";
import { twMerge } from "tailwind-merge";

import type { SubtitleSegment } from "@/core/storage";

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
export function toTraditionalChinese(subtitles: SubtitleSegment[]): SubtitleSegment[] {
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
