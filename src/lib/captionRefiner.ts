/**
 * Caption Refiner using LangChain
 * Refines YouTube transcript segments using LLM batch processing
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { API_ENDPOINTS, DEFAULTS, REFINER_CONFIG } from "./constants";
import { chunkSegmentsByCount, parseRefinedSegments } from "./segmentParser";
import { SubtitleSegment } from "./storage";

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

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

function createLLM(apiKey: string, model: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: {
      baseURL: API_ENDPOINTS.OPENROUTER_BASE,
      defaultHeaders: {
        "HTTP-Referer": chrome.runtime.getURL(""),
        "X-Title": "Better YouTube",
      },
    },
    temperature: 0,
  });
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

/**
 * Refine video transcript using LLM inference
 */
export async function refineTranscriptWithLLM(
  segments: SubtitleSegment[],
  title: string,
  description: string,
  apiKey: string,
  progressCallback?: (chunkIdx: number, totalChunks: number) => void,
  model: string = DEFAULTS.MODEL_REFINER,
  onPriorityComplete?: (prioritySegments: SubtitleSegment[]) => void
): Promise<SubtitleSegment[]> {
  if (!segments.length) return [];

  const llm = createLLM(apiKey, model);
  const preambleText = buildUserPreamble(title, description);

  // Determine priority window (First 5 mins or 50% of video)
  const durationMs = segments[segments.length - 1].endTime;
  const PRIORITY_DURATION_MS = Math.min(5 * 60 * 1000, 0.5 * durationMs);
  
  let splitIndex = segments.findIndex(s => s.endTime > PRIORITY_DURATION_MS);
  if (splitIndex === -1) splitIndex = segments.length;

  const priorityRangeCount = Math.ceil(splitIndex / REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK);
  const ranges = chunkSegmentsByCount(segments, REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK);
  
  const batchMessages = ranges.map(([start, end]) => [
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage({ content: `${preambleText}\n${formatTranscriptSegments(segments.slice(start, end))}` }),
  ]);

  progressCallback?.(0, batchMessages.length);

  let completedPriorityChunks = 0;
  let priorityReported = false;

  const responses = await runConcurrentBatch(
    batchMessages,
    8,
    async (messages, idx) => {
      const res = await llm.invoke(messages);
      progressCallback?.(idx + 1, batchMessages.length);
      return res;
    },
    (result, index, allResults) => {
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
    }
  );

  const refinedText = responses
    .map((res, i) => {
      const text = extractResponseText(res).trim();
      const expectedCount = ranges[i][1] - ranges[i][0];
      if (text.split("\n").length !== expectedCount) {
        console.warn(`Line count mismatch in chunk ${i+1}: expected ${expectedCount}, got ${text.split("\n").length}`);
      }
      return text;
    })
    .join(`\n${REFINER_CONFIG.CHUNK_SENTINEL}\n`);

  return parseRefinedSegments(
    refinedText,
    segments,
    REFINER_CONFIG.CHUNK_SENTINEL,
    REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK
  );
}
