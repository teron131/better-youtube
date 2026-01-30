/**
 * Caption Refiner using LangChain
 * Refines YouTube transcript segments using LLM batch processing
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DEFAULTS, REFINER_CONFIG } from "../constants";
import { chunkSegmentsByCount, parseRefinedSegments } from "../segmentParser";
import { SubtitleSegment } from "../storage";
import { formatTimestamp } from "../time";
import { createRefinerLLM } from "./openrouter";

// ============================================================================
// Constants
// ============================================================================

const SYSTEM_PROMPT = `You are correcting segments of a YouTube video transcript. These segments could be from anywhere in the video (beginning, middle, or end). Use the video title and description for context.

CRITICAL CONSTRAINTS:
- Only fix typos and grammar. Do NOT change meaning or structure.
- PRESERVE ALL NEWLINES: each line is a distinct transcript segment.
- Do NOT add, remove, or merge lines. Keep the same number of lines.
- MAINTAIN SIMILAR LINE LENGTHS: Each output line should be approximately the same character count as its corresponding input line (±10% tolerance). Do NOT expand short lines into long paragraphs. Do NOT condense long lines significantly. Keep each line concise.
- If a sentence is broken across lines, keep it broken the same way.
- PRESERVE THE ORIGINAL LANGUAGE: output must be in the same language as the input transcript.
- Focus on minimal corrections: fix typos, correct grammar errors, but keep expansions/additions to an absolute minimum.

EXAMPLES OF CORRECT BEHAVIOR:

Input:
up to 900. From 900 up to 1,100.
If you sold at the reasonable
valuations, when the gains that already
been had, you missed out big time. I 

Output:
up to $900. From $900 up to $1,100.
If you sold at the reasonable
valuations, when the gains that already
had been had, you missed out big time. I`;

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeSegmentText(text: string): string {
  return (text || "").split(/\s+/).join(" ");
}

function formatTranscriptSegments(segments: SubtitleSegment[]): string {
  return segments
    .map((seg) => {
      const normalizedText = normalizeSegmentText(seg.text);
      const timestamp = seg.startTimeText || formatTimestamp(seg.startTime);
      return `[${timestamp}] ${normalizedText}`;
    })
    .join("\n");
}

function buildUserPreamble(title: string, description: string): string {
  return [
    `Video Title: ${title || ""}`,
    `Video Description: ${description || ""}`,
    "",
    "Transcript Chunk:",
  ].join("\n");
}

function extractResponseText(response: any): string {
  const content = response?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(part => typeof part === "string" ? part : part?.text || "").join("");
  }
  return content != null ? String(content) : "";
}

/**
 * Custom concurrency handler for batch processing
 */
async function runConcurrentBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onEachComplete?: (result: R, index: number, allResults: (R | null)[]) => void
): Promise<R[]> {
  const results = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));
  
  const workers = Array.from({ length: Math.min(concurrency, items.length) }).map(async () => {
    while (queue.length > 0) {
      const { item, index } = queue.shift()!;
      try {
        const result = await fn(item, index);
        results[index] = result;
        onEachComplete?.(result, index, results);
      } catch (error) {
        console.error(`Error processing batch item ${index}:`, error);
        results[index] = null;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

// ============================================================================
// Main Refinement Logic
// ============================================================================

interface PriorityWindow {
  splitIndex: number;
  priorityRangeCount: number;
}

/**
 * Calculate the priority window for early subtitle delivery
 * Returns the index where priority ends and how many chunks it spans
 */
function calculatePriorityWindow(
  segments: SubtitleSegment[],
  maxSegmentsPerChunk: number
): PriorityWindow {
  const durationMs = segments[segments.length - 1].endTime;
  const PRIORITY_DURATION_MS = Math.min(5 * 60 * 1000, 0.5 * durationMs);

  let splitIndex = segments.findIndex(s => s.endTime > PRIORITY_DURATION_MS);
  if (splitIndex === -1) splitIndex = segments.length;

  const priorityRangeCount = Math.ceil(splitIndex / maxSegmentsPerChunk);
  return { splitIndex, priorityRangeCount };
}

/**
 * Create a handler for priority chunk completion
 * Calls the callback once all priority chunks are processed
 */
function createPriorityHandler(
  priorityRangeCount: number,
  splitIndex: number,
  segments: SubtitleSegment[],
  onPriorityComplete?: (segments: SubtitleSegment[]) => void
): (result: any, index: number, allResults: (any | null)[]) => void {
  let completedPriorityChunks = 0;
  let priorityReported = false;

  return (result, index, allResults) => {
    if (index < priorityRangeCount) completedPriorityChunks++;

    if (onPriorityComplete && !priorityReported && completedPriorityChunks === priorityRangeCount) {
      priorityReported = true;
      const priorityText = allResults
        .slice(0, priorityRangeCount)
        .map(r => r ? extractResponseText(r).trim() : "")
        .join(`\n${REFINER_CONFIG.CHUNK_SENTINEL}\n`);

      onPriorityComplete(parseRefinedSegments(
        priorityText,
        segments.slice(0, splitIndex),
        REFINER_CONFIG.CHUNK_SENTINEL,
        REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK
      ));
    }
  };
}

/**
 * Validate and extract refined text from response with line count checking
 */
function validateAndExtractChunk(response: any, range: [number, number], chunkIndex: number): string {
  const text = extractResponseText(response).trim();
  const expectedCount = range[1] - range[0];
  const actualCount = text.split("\n").length;

  if (actualCount !== expectedCount) {
    console.warn(
      `Line count mismatch in chunk ${chunkIndex + 1}: expected ${expectedCount}, got ${actualCount}`
    );
  }

  return text;
}

/**
 * Refine video transcript using LLM inference
 */
export async function refineTranscriptWithLLM(
  segments: SubtitleSegment[],
  title: string,
  description: string,
  onProgress?: (chunkIdx: number, totalChunks: number) => void,
  model: string = DEFAULTS.MODEL_REFINER,
  onPriorityComplete?: (prioritySegments: SubtitleSegment[]) => void
): Promise<SubtitleSegment[]> {
  if (!segments.length) return [];

  const llm = await createRefinerLLM(model);
  const preambleText = buildUserPreamble(title, description);
  const { splitIndex, priorityRangeCount } = calculatePriorityWindow(
    segments,
    REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK
  );

  const ranges = chunkSegmentsByCount(segments, REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK);
  const batchMessages = ranges.map(([start, end]) => [
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage({ content: `${preambleText}\n${formatTranscriptSegments(segments.slice(start, end))}` }),
  ]);

  onProgress?.(0, batchMessages.length);

  const responses = await runConcurrentBatch(
    batchMessages,
    REFINER_CONFIG.CONCURRENCY_LIMIT,
    async (messages, idx) => {
      const res = await llm.invoke(messages);
      onProgress?.(idx + 1, batchMessages.length);
      return res;
    },
    createPriorityHandler(priorityRangeCount, splitIndex, segments, onPriorityComplete)
  );

  const refinedText = responses
    .map((res, i) => validateAndExtractChunk(res, ranges[i], i))
    .join(`\n${REFINER_CONFIG.CHUNK_SENTINEL}\n`);

  return parseRefinedSegments(
    refinedText,
    segments,
    REFINER_CONFIG.CHUNK_SENTINEL,
    REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK
  );
}
