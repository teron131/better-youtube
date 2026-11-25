/** The numbered-line request and reply format, one model call's retry policy, and the bounded parallel batch runner. */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatOpenAI } from "@langchain/openai";

import { REFINER_CONFIG } from "@/core/constants";
import { repeatedNames } from "@/core/transcript/names";

import { fill, HEADER, TRANSLATION_TARGET } from "./prompts.ts";

export interface VideoText {
  title: string;
  description: string;
}

// Counts attempts at a reply that throws, is empty, or misses an ID.
export const ATTEMPTS = 3;
const MAX_NAMES = 60;
// A reply line opens with its item's ID, so a merged or split item shows as a missing ID or a line without one instead of shifting every later line onto the wrong item.
// " [LINE12]  TEXT" → ("12", "TEXT")
const LINE_ID = /^\s*\[LINE(\d+)\]\s*(.*)$/;

/** Every request opens with this header, which lists the names the transcript says more than once. */
export function requestHeader(video: VideoText, transcript: string): string {
  return fill(HEADER, {
    title: video.title,
    description: video.description,
    names: repeatedNames(transcript).slice(0, MAX_NAMES).join(", "),
  });
}

/** The numbered `items` between up to `context` of `lines` before `bounds` and after it, closing with the target language when `language` asks for a translation. */
export function request(
  header: string,
  lines: readonly string[],
  [start, end]: readonly [number, number],
  items: readonly string[],
  { context, language }: { context: number; language: string | null },
): string {
  const before = lines.slice(Math.max(0, start - context), start).join("\n");
  const after = lines.slice(end, end + context).join("\n");
  const user = `${header}\n\n<before>\n${before}\n</before>\n\n${numbered(items)}\n\n<after>\n${after}\n</after>`;
  return language ? `${user}\n\n${fill(TRANSLATION_TARGET, { language })}` : user;
}

function numbered(lines: readonly string[]): string {
  const block = lines.map((line, index) => `[LINE${index + 1}] ${line}`).join("\n");
  return `<lines count="${lines.length}">\n${block}\n</lines>`;
}

/** Text by 1-based ID; a line without an ID continues the one before it, and lines before the first ID or under an ID outside 1 to `count` are dropped. */
export function replies(reply: string, count: number): Map<number, string> {
  const parts = new Map<number, string[]>();
  let current: number | null = null;
  for (let line of reply.split(/\r?\n/)) {
    const match = LINE_ID.exec(line);
    if (match) {
      const number = Number(match[1]);
      current = number >= 1 && number <= count ? number : null;
      line = match[2];
    }
    if (current !== null && line.trim()) {
      parts.set(current, [...(parts.get(current) ?? []), line.trim()]);
    }
  }
  return new Map([...parts].map(([number, texts]) => [number, texts.join(" ")]));
}

/** Rejects with the abort reason when `signal` aborts; any other failure rejects with the host's error. */
export async function invoke(
  llm: ChatOpenAI,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await llm.invoke([new SystemMessage(system), new HumanMessage(user)], {
    signal,
  });
  return response.text;
}

/** Call between failed attempts: rethrows an abort, and waits before the next attempt only when the host rate-limited this one. */
export async function recover(error: unknown, attempt: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  console.warn(`[refine] attempt ${attempt + 1} of ${ATTEMPTS} failed`, error);
  if (String(error).includes("429") && attempt < ATTEMPTS - 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}

export function fixedBatches(count: number, size: number): Array<[number, number]> {
  const batches: Array<[number, number]> = [];
  for (let start = 0; start < count; start += size) {
    batches.push([start, Math.min(start + size, count)]);
  }
  return batches;
}

/**
 * Runs `job` over `batches` with bounded concurrency, returning results in batch order and calling `onSettled` as each finishes.
 * The first failing batch aborts the rest and rejects naming its 1-based span of `total` `unit`, except that an abort of `signal` rejects with its reason.
 */
export async function runBatches<Result>(
  batches: ReadonlyArray<readonly [number, number]>,
  job: (bounds: readonly [number, number], signal: AbortSignal) => Promise<Result>,
  {
    signal,
    task,
    unit,
    total,
    onSettled,
  }: {
    signal: AbortSignal;
    task: string;
    unit: string;
    total: number;
    onSettled?: (index: number, result: Result) => void;
  },
): Promise<Result[]> {
  const failed = new AbortController();
  const batchSignal = AbortSignal.any([signal, failed.signal]);
  const results = new Array<Result>(batches.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < batches.length) {
      batchSignal.throwIfAborted();
      const index = cursor++;
      const [start, end] = batches[index];
      try {
        results[index] = await job(batches[index], batchSignal);
      } catch (error) {
        signal.throwIfAborted();
        if (failed.signal.aborted) throw failed.signal.reason;
        const reason = new Error(
          `${task} failed for ${unit} ${start + 1}-${end} of ${total}: ${error instanceof Error ? error.message : String(error)}`,
        );
        failed.abort(reason);
        throw reason;
      }
      onSettled?.(index, results[index]);
    }
  };
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(REFINER_CONFIG.CONCURRENCY_LIMIT, batches.length) }, worker),
  );
  signal.throwIfAborted();
  if (failed.signal.aborted) throw failed.signal.reason;
  const rejection = settled.find((outcome) => outcome.status === "rejected");
  if (rejection) throw rejection.reason;
  return results;
}
