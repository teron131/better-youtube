import type { SubtitleSegment } from "@/lib/storage";
import * as OpenCC from "opencc-js";

const converterCN2TW = OpenCC.Converter({ from: "cn", to: "tw" });
const CHINESE_CHAR_REGEX = /[\u4E00-\u9FFF]/;

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
