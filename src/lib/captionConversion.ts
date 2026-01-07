import type { SubtitleSegment } from "@/lib/storage";
import * as OpenCC from "opencc-js";

const converterCN2TW = OpenCC.Converter({ from: "cn", to: "tw" });

/**
 * Converts simplified Chinese to traditional Chinese
 */
export function s2tw(content: string): string {
  if (!content) return content;
  try {
    return converterCN2TW(content);
  } catch (error) {
    console.warn("Chinese conversion (CN->TW) failed:", error);
    return content;
  }
}

/**
 * Convert subtitles to target language if needed
 * Batch processes all segments for performance
 */
export function convertSubtitlesForTargetLanguage(
  subtitles: SubtitleSegment[],
  targetLanguage: string
): SubtitleSegment[] {
  if (!subtitles || subtitles.length === 0) return subtitles;
  if (targetLanguage !== "zh-TW") return subtitles;

  return subtitles.map((segment) => ({
    ...segment,
    text: s2tw(segment.text),
  }));
}
