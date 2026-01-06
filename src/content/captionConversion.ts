import type { SubtitleSegment } from "@/lib/storage";
import * as OpenCC from "opencc-js";

const converterCN2TW = OpenCC.Converter({ from: "cn", to: "tw" });

function s2tw(content: string): string {
  if (!content || content.length < 2) return content;
  try {
    return converterCN2TW(content);
  } catch (error) {
    console.warn("Chinese conversion (CN->TW) failed:", error);
    return content;
  }
}

export function convertSubtitlesForTargetLanguage(
  subtitles: SubtitleSegment[],
  targetLanguage: string
): SubtitleSegment[] {
  if (targetLanguage !== "zh-TW") return subtitles;
  return subtitles.map((segment) => ({
    ...segment,
    text: s2tw(segment.text),
  }));
}
