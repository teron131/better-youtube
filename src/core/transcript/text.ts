/** Resolves supplied transcript text or a watch URL through the existing scoped caption service. */

import { extractVideoId } from "../utils/url.ts";
import { fetchTranscript, getTranscriptText, type TranscriptFetchContext } from "./service.ts";

/** Preserves supplied text verbatim and uses the transcript service's cache and tab context for URLs. */
export async function resolveTranscriptText(
  input: string,
  videoId?: string,
  context?: TranscriptFetchContext,
): Promise<string> {
  if (!input.includes("youtube.com/watch") && !input.includes("youtu.be/")) return input;
  const resolvedVideoId = videoId ?? extractVideoId(input);
  if (!resolvedVideoId) throw new Error("Could not extract video id.");
  const data = await fetchTranscript(resolvedVideoId, context);
  if (!data) throw new Error("No transcript available for this video.");
  const transcriptOnlyText =
    typeof data.transcript_only_text === "string" ? data.transcript_only_text : "";
  const transcript = (transcriptOnlyText || getTranscriptText(data.transcript ?? [])).trim();
  if (!transcript) throw new Error("No transcript found for this video.");
  return transcript;
}
