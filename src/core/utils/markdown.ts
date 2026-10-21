/** Formats copied summary text with optional video attribution and the same Traditional Chinese conversion the panel displays, without imposing a summary structure. */

import type { VideoInfoResponse } from "@/core/types";

import { s2tw } from "./text";

export function generateSummaryMarkdown(summary: string, videoInfo?: VideoInfoResponse): string {
  const info = [
    videoInfo?.url && `**URL:** ${videoInfo.url}`,
    videoInfo?.title && `**Title:** ${videoInfo.title}`,
    videoInfo?.thumbnail && `**Thumbnail:** ${videoInfo.thumbnail}`,
    videoInfo?.author && `**Channel:** ${videoInfo.author}`,
  ].filter(Boolean);
  return [...info, s2tw(summary)].join("\n\n");
}
