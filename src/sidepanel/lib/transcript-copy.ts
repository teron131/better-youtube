/** Formats transcript exports from the current video metadata contract without changing the source text. */

import { formatDate, trimLeadingZeros } from "../../core/utils/date.ts";

export interface TranscriptCopyMetadata {
  title?: string | null;
  author?: string | null;
  duration?: string | null;
  uploadDate?: string | null;
}

function metadataLine(label: string, value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

export function buildTranscriptWithMetadata(
  transcript: string,
  metadata?: TranscriptCopyMetadata | null,
): string {
  const formattedDuration = trimLeadingZeros(metadata?.duration);
  const formattedDate = formatDate(metadata?.uploadDate);
  const headerLines = [
    metadataLine("Title", metadata?.title),
    metadataLine("Author", metadata?.author),
    metadataLine("Duration", formattedDuration),
    metadataLine("Date", formattedDate),
  ].filter((line): line is string => Boolean(line));

  if (!headerLines.length) return transcript;
  return `${headerLines.join("\n")}\n\n${transcript}`;
}
