/** Rewrites caption lines under their own IDs, so every reply keeps the timing of the line it came from. */

import type { ChatOpenAI } from "@langchain/openai";

import { REFINER_CONFIG } from "@/core/constants";
import type { SubtitleSegment } from "@/core/storage";

import { CORRECT_LINES, fill, TRANSLATE_LINES } from "./prompts.ts";
import {
  ATTEMPTS,
  fixedBatches,
  invoke,
  recover,
  replies,
  request,
  runBatches,
} from "./requests.ts";

const MIN_LINE_SIMILARITY = 0.5;

/** Rewritten lines by batch, in order; `language` translates, and null cleans up in the captions' own language. */
export async function rewriteLines(
  llm: ChatOpenAI,
  header: string,
  lines: readonly SubtitleSegment[],
  language: string | null,
  {
    signal,
    onBatch,
  }: { signal: AbortSignal; onBatch: (index: number, lines: SubtitleSegment[]) => void },
): Promise<SubtitleSegment[][]> {
  const texts = lines.map((line) => line.text.replace(/\s+/g, " ").trim());
  const system = language ? fill(TRANSLATE_LINES, { language }) : CORRECT_LINES;

  const rewrite = async ([start, end]: readonly [number, number], batchSignal: AbortSignal) => {
    const user = request(header, texts, [start, end], texts.slice(start, end), {
      context: REFINER_CONFIG.CONTEXT_LINES,
      language,
    });
    let best = new Map<number, string>();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < ATTEMPTS && best.size < end - start; attempt++) {
      try {
        const parsed = replies(await invoke(llm, system, user, batchSignal), end - start);
        if (parsed.size > best.size) best = parsed;
      } catch (error) {
        lastError = error;
        await recover(error, attempt, batchSignal);
      }
    }
    if (language && !best.size) {
      throw lastError instanceof Error ? lastError : new Error("The model returned no translation");
    }
    return aligned(lines.slice(start, end), best, language !== null);
  };

  return runBatches(fixedBatches(lines.length, REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK), rewrite, {
    signal,
    task: language ? "Translation" : "Refinement",
    unit: "lines",
    total: lines.length,
    onSettled: onBatch,
  });
}

/**
 * A missing ID means the model merged that line into a neighbour, so the entry before it, or after it for a batch's first line, spans both.
 * A cleaned-up copy keeps the original line wherever a reply is too unlike it to be a correction, and keeps a missing line apart when the neighbour's reply reads as that neighbour alone.
 */
function aligned(
  lines: readonly SubtitleSegment[],
  texts: ReadonlyMap<number, string>,
  translated: boolean,
): SubtitleSegment[] {
  const groups: Array<{ first: number; last: number; owner: number }> = [];
  let pending: number | null = null;
  for (let number = 1; number <= lines.length; number++) {
    if (texts.has(number)) {
      groups.push({ first: pending ?? number, last: number, owner: number });
      pending = null;
    } else if (groups.length) {
      groups[groups.length - 1].last = number;
    } else {
      pending ??= number;
    }
  }
  if (!groups.length) return [...lines];

  return groups.flatMap(({ first, last, owner }) => {
    const span = lines.slice(first - 1, last);
    const text = texts.get(owner)!;
    const merged: SubtitleSegment = {
      ...span[0],
      endTime: span[span.length - 1].endTime,
      text,
    };
    if (translated) return [merged];
    const own = similarity(lines[owner - 1].text, text);
    const joined = span.map((line) => line.text).join(" ");
    if (span.length > 1 && similarity(joined, text) >= Math.max(own, MIN_LINE_SIMILARITY)) {
      return [merged];
    }
    return span.map((line, index) =>
      first + index === owner && own >= MIN_LINE_SIMILARITY ? { ...line, text } : line,
    );
  });
}

/**
 * Python difflib's `SequenceMatcher(None, source, rewritten, autojunk=False).ratio()`, the toolkit's check: twice the matched characters over the combined length.
 * Matches are found as in difflib: the longest common run, earliest in `source` on ties, then the same search on each side of it.
 */
function similarity(source: string, rewritten: string): number {
  const [a, b] = [[...source], [...rewritten]];
  if (!a.length && !b.length) return 1;
  const matched = (aLow: number, aHigh: number, bLow: number, bHigh: number): number => {
    let [bestA, bestB, size] = [aLow, bLow, 0];
    let previous = new Map<number, number>();
    for (let i = aLow; i < aHigh; i++) {
      const lengths = new Map<number, number>();
      for (let j = bLow; j < bHigh; j++) {
        if (a[i] !== b[j]) continue;
        const length = (previous.get(j - 1) ?? 0) + 1;
        lengths.set(j, length);
        if (length > size) [bestA, bestB, size] = [i - length + 1, j - length + 1, length];
      }
      previous = lengths;
    }
    if (!size) return 0;
    return (
      size + matched(aLow, bestA, bLow, bestB) + matched(bestA + size, aHigh, bestB + size, bHigh)
    );
  };
  return (2 * matched(0, a.length, 0, b.length)) / (a.length + b.length);
}
