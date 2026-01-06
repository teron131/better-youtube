import type { SubtitleSegment } from "@/lib/storage";
import * as OpenCC from "opencc-js";

const converterCN2TW = OpenCC.Converter({ from: "cn", to: "tw" });

/**
 * Converts simplified Chinese to traditional Chinese
 * Always converts regardless of content length
 */
function s2tw(content: string): string {
  if (!content) return content;
  try {
    return converterCN2TW(content);
  } catch (error) {
    console.warn("Chinese conversion (CN->TW) failed:", error);
    return content;
  }
}

/**
 * Batch convert subtitle segments for better performance
 * Processes all segments in a single operation
 */
function convertSubtitlesBatch(subtitles: SubtitleSegment[]): SubtitleSegment[] {
  if (!subtitles || subtitles.length === 0) return subtitles;

  return subtitles.map((segment) => ({
    ...segment,
    text: s2tw(segment.text),
  }));
}

/**
 * Convert subtitles to target language if needed
 * Optimized for batch processing and concurrent operations
 */
export function convertSubtitlesForTargetLanguage(
  subtitles: SubtitleSegment[],
  targetLanguage: string
): SubtitleSegment[] {
  if (!subtitles || subtitles.length === 0) return subtitles;
  if (targetLanguage !== "zh-TW") return subtitles;

  return convertSubtitlesBatch(subtitles);
}

/**
 * Synchronously convert subtitles immediately
 * Use this when you need to ensure conversion happens before storage
 */
export function convertSubtitlesImmediate(
  subtitles: SubtitleSegment[],
  targetLanguage: string
): SubtitleSegment[] {
  return convertSubtitlesForTargetLanguage(subtitles, targetLanguage);
}
