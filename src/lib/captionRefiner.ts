/**
 * Caption Refiner using LangChain
 * Refines YouTube transcript segments using LLM batch processing
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { CHROME_API } from "./chromeConstants";
import { DEFAULTS, REFINER_CONFIG } from "./constants";
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
  return text.split(/\s+/).join(" ");
}

function buildUserPreamble(title: string, description: string): string {
  return [
    `Video Title: ${title || ""}`,
    `Video Description: ${description || ""}`,
    "",
    "Transcript Chunk:",
  ].join("\n");
}

// ============================================================================ 
// Main Refinement Function
// ============================================================================ 

function createLLM(apiKey: string, model: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: {
      baseURL: CHROME_API.OPENROUTER_BASE_URL,
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
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(part => typeof part === "string" ? part : part?.text || "").join("");
  }
  return content != null ? String(content) : "";
}

/**
 * Refine video transcript using LLM inference
 */
export async function refineTranscriptWithLLM(
  segments: SubtitleSegment[],
  title: string,
  description: string,
  apiKey: string,
  progressCallback?: (chunkIdx: number, totalChunks: number) => void,
  model: string = DEFAULTS.MODEL_REFINER
): Promise<SubtitleSegment[]> {
  if (!segments.length) {
    return [];
  }

  const llm = createLLM(apiKey, model);
  const preambleText = buildUserPreamble(title, description);

  const ranges = chunkSegmentsByCount(segments, REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK);
  const batchMessages: (SystemMessage | HumanMessage)[][] = [];
  const chunkInfo: { chunkIdx: number; expectedLineCount: number }[] = [];

  for (let chunkIdx = 0; chunkIdx < ranges.length; chunkIdx++) {
    const [startIdx, endIdx] = ranges[chunkIdx];
    const chunkSegments = segments.slice(startIdx, endIdx);
    const chunkTextOnly = chunkSegments.map(seg => normalizeSegmentText(seg.text)).join("\n");

    batchMessages.push([
      new SystemMessage({ content: SYSTEM_PROMPT }),
      new HumanMessage({ content: `${preambleText}\n${chunkTextOnly}` }),
    ]);

    chunkInfo.push({
      chunkIdx: chunkIdx + 1,
      expectedLineCount: chunkSegments.length,
    });
  }

  progressCallback?.(0, batchMessages.length);

  const responses = await llm.batch(batchMessages);

  const allRefinedLines: string[] = [];
  for (let i = 0; i < responses.length; i++) {
    const { chunkIdx, expectedLineCount } = chunkInfo[i];
    const refinedText = extractResponseText(responses[i]);
    const refinedLines = refinedText.trim().split("\n");

    progressCallback?.(chunkIdx, batchMessages.length);

    if (refinedLines.length !== expectedLineCount) {
      console.warn(`Line count mismatch in chunk ${chunkIdx}: expected ${expectedLineCount}, got ${refinedLines.length}`);
    }

    allRefinedLines.push(...refinedLines, REFINER_CONFIG.CHUNK_SENTINEL);
  }

  const refinedText = allRefinedLines.join("\n");
  return parseRefinedSegments(
    refinedText,
    segments,
    REFINER_CONFIG.CHUNK_SENTINEL,
    REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK
  );
}
