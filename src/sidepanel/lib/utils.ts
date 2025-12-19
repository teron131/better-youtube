/**
 * General utility functions including Tailwind class merging and Chinese text conversion.
 */

import { AnalysisData, VideoInfoResponse } from "@ui/services/types";
import { clsx, type ClassValue } from "clsx";
import * as OpenCC from 'opencc-js';
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize converter immediately for serverless compatibility
const converterCN2TW = OpenCC.Converter({ from: 'cn', to: 'tw' });

/**
 * Convert simplified Chinese to traditional Chinese (Taiwan variant)
 * Safe to use on any text - won't break non-Chinese content
 * Optimized for serverless deployment
 */
export function s2tw(content: string): string {
  if (!content || content.length < 2) return content;

  try {
    return converterCN2TW(content);
  } catch (error) {
    console.warn('Chinese conversion (CN→TW) failed:', error);
    return content;
  }
}

/**
 * Convert analysis text fields to traditional Chinese (Taiwan variant)
 * Only converts the final results that are displayed to the user
 */
export function convertAnalysisChinese(analysis: AnalysisData): AnalysisData {
  const takeaways = Array.isArray(analysis.takeaways) ? analysis.takeaways : [];
  const keywords = Array.isArray(analysis.keywords) ? analysis.keywords : [];
  const chapters = Array.isArray(analysis.chapters) ? analysis.chapters : [];

  return {
    ...analysis,
    title: s2tw(analysis.title || ''),
    summary: s2tw(analysis.summary || ''),
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
