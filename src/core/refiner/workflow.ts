/** Entry point for caption rewrites: the same timed captions refined in their own language or translated, with partial results for the player. */

import { ChatOpenAI } from "@langchain/openai";

import { resolveLlmConnection } from "@/core/clients/config";
import { createBrowserSafeOpenAiFetch, isBrowserRuntime } from "@/core/clients/transport";
import { loadConfig } from "@/core/config";
import { REFINER_CONFIG } from "@/core/constants";
import { describeLanguage } from "@/core/language";
import type { CaptionProgress, SubtitleSegment } from "@/core/storage";

import { rewriteLines } from "./lines.ts";
import { requestHeader, type VideoText } from "./requests.ts";

export interface CaptionRunHooks {
  /** Aborting stops in-flight model calls and rejects the run with the abort reason. */
  signal: AbortSignal;
  onPriorityComplete?: (prioritySegments: SubtitleSegment[]) => void;
  /** Called after each batch settles, including batches that kept their original text. */
  onProgress?: (progress: CaptionProgress) => void;
}

/**
 * Translates timed captions into `language`, a code such as `en` or a name the user typed, or with null cleans them up in their own language.
 * Lines the model merges come back as one segment spanning their times, and end times are clamped to the next start so captions never overlap.
 * A cleanup keeps any line whose replies fail, while a translation batch that returns nothing rejects the run, so untranslated text never passes as translated.
 * `onPriorityComplete` receives the opening window, the first five minutes or the first half of a shorter video, as soon as its batches settle.
 */
export async function rewriteCaptions(
  segments: readonly SubtitleSegment[],
  video: VideoText,
  model: string,
  language: string | null,
  { signal, onPriorityComplete, onProgress }: CaptionRunHooks,
): Promise<SubtitleSegment[]> {
  if (!segments.length) return [];
  const llm = await createCaptionModel(model, language ? "Translator" : "Refiner");
  const header = requestHeader(video, segments.map((segment) => segment.text).join(" "));
  const totalBatches = Math.ceil(segments.length / REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK);
  const priorityBatches = Math.ceil(
    priorityLineCount(segments) / REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK,
  );
  const settled = new Map<number, SubtitleSegment[]>();
  let prioritySettled = 0;
  const batches = await rewriteLines(
    llm,
    header,
    segments,
    language && describeLanguage(language),
    {
      signal,
      onBatch: (index, lines) => {
        settled.set(index, lines);
        onProgress?.({ completedBatches: settled.size, totalBatches });
        if (index < priorityBatches && ++prioritySettled === priorityBatches) {
          onPriorityComplete?.(
            withoutOverlaps(
              Array.from({ length: priorityBatches }, (_, key) => settled.get(key)!).flat(),
            ),
          );
        }
      },
    },
  );
  return withoutOverlaps(batches.flat());
}

/** Segments that end within the first five minutes, or within the first half of a video under ten minutes. */
function priorityLineCount(segments: readonly SubtitleSegment[]): number {
  const windowMs = Math.min(5 * 60 * 1000, 0.5 * segments[segments.length - 1].endTime);
  const index = segments.findIndex((segment) => segment.endTime > windowMs);
  return index === -1 ? segments.length : index;
}

function withoutOverlaps(segments: SubtitleSegment[]): SubtitleSegment[] {
  return segments.map((segment, index) => {
    const next = segments[index + 1];
    return next && segment.endTime > next.startTime
      ? { ...segment, endTime: next.startTime }
      : segment;
  });
}

/** Outside the browser, a missing saved key falls back to the `LLM_API_KEY` environment variable. */
async function createCaptionModel(
  model: string,
  operation: "Refiner" | "Translator",
): Promise<ChatOpenAI> {
  const config = await loadConfig();
  const connection = resolveLlmConnection(model, {
    ...config,
    llmApiKey:
      config.llmApiKey || (typeof process !== "undefined" ? process.env.LLM_API_KEY : null),
  });
  return new ChatOpenAI({
    model: connection.model,
    apiKey: connection.apiKey,
    configuration: {
      baseURL: connection.baseURL,
      ...(isBrowserRuntime()
        ? { fetch: createBrowserSafeOpenAiFetch() }
        : { defaultHeaders: { "X-Title": `Better YouTube - ${operation}` } }),
    },
    temperature: 0.0,
  });
}
