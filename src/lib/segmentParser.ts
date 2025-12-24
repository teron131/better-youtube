/**
 * Segment Parser Module
 * Advanced transcript segment alignment using dynamic programming
 */

import { SEGMENT_PARSER_CONFIG } from "./constants";
import type { SubtitleSegment } from "./storage";

/**
 * Compute character-level similarity ratio
 */
function computeCharSimilarity(a: string, b: string): number {
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  if (!longer.length) return 1.0;
  const longerChars = new Set(longer);
  const matches = [...shorter].filter(c => longerChars.has(c)).length;
  return matches / longer.length;
}

/**
 * Compute token-level Jaccard similarity
 */
function computeTokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.toLowerCase().match(/[a-z0-9']+/gi) || []);
  const bTokens = new Set(b.toLowerCase().match(/[a-z0-9']+/gi) || []);
  const intersection = new Set([...aTokens].filter((x) => bTokens.has(x)));
  const union = new Set([...aTokens, ...bTokens]);
  return union.size ? intersection.size / union.size : 0.0;
}

/**
 * Compute similarity between two text strings
 * Uses character-level (70%) and token-level (30%) similarity
 */
function computeLineSimilarity(a: string, b: string): number {
  if (!a || !b) return 0.0;
  return 0.7 * computeCharSimilarity(a, b) + 0.3 * computeTokenSimilarity(a, b);
}

/**
 * Normalize line to extract text only (remove timestamps)
 * Handles format: [timestamp] text
 */
function normalizeLineToText(line: string): string {
  const normalized = line.split(/\s+/).join(" ").trim();
  const timestampMatch = normalized.match(/^\[[^\]]+\]\s*(.*)$/);
  return timestampMatch ? timestampMatch[1].trim() : normalized;
}

/** Align original segments to refined texts using dynamic programming */
function dpAlignSegments(
  origSegments: SubtitleSegment[],
  refTexts: string[],
  applyTailGuard = false
): SubtitleSegment[] {
  const nOrig = origSegments.length;
  const nRef = refTexts.length;
  if (nOrig === 0) return [];

  const { GAP_PENALTY, TAIL_GUARD_SIZE, LENGTH_TOLERANCE } = SEGMENT_PARSER_CONFIG;

  // Initialize DP matrices
  const dp: number[][] = Array(nOrig + 1).fill(null).map(() => Array(nRef + 1).fill(-Infinity));
  const back: (string | null)[][] = Array(nOrig + 1).fill(null).map(() => Array(nRef + 1).fill(null));
  dp[0][0] = 0.0;
  for (let i = 1; i <= nOrig; i++) { dp[i][0] = dp[i - 1][0] + GAP_PENALTY; back[i][0] = "O"; }
  for (let j = 1; j <= nRef; j++) { dp[0][j] = dp[0][j - 1] + GAP_PENALTY; back[0][j] = "R"; }

  // Fill DP table
  for (let i = 1; i <= nOrig; i++) {
    const origText = origSegments[i - 1].text;
    for (let j = 1; j <= nRef; j++) {
      const refText = refTexts[j - 1];
      let bestScore = dp[i - 1][j - 1] + computeLineSimilarity(origText, refText);
      let bestPtr = "M";
      const oScore = dp[i - 1][j] + GAP_PENALTY;
      if (oScore > bestScore) { bestScore = oScore; bestPtr = "O"; }
      const rScore = dp[i][j - 1] + GAP_PENALTY;
      if (rScore > bestScore) { bestScore = rScore; bestPtr = "R"; }
      dp[i][j] = bestScore;
      back[i][j] = bestPtr;
    }
  }

  // Backtrack to find mapping
  const mapping: (number | null)[] = Array(nOrig).fill(null);
  let i = nOrig, j = nRef;
  while (i > 0 || j > 0) {
    const ptr = back[i][j];
    if (ptr === "M" && i > 0 && j > 0) { mapping[i - 1] = j - 1; i--; j--; }
    else if (ptr === "O" && i > 0) { mapping[i - 1] = null; i--; }
    else if (ptr === "R" && j > 0) { j--; }
    else if (i > 0) { mapping[i - 1] = null; i--; }
    else if (j > 0) { j--; }
    else break;
  }

  const tailStart = applyTailGuard ? nOrig - TAIL_GUARD_SIZE : nOrig + 1;
  const aligned = origSegments.map((origSeg, idx) => {
    const refIdx = mapping[idx];
    let text = (refIdx !== null && refIdx >= 0 && refIdx < nRef) ? refTexts[refIdx] : origSeg.text;
    if (idx >= tailStart && text) {
      const origLen = origSeg.text.length || 1;
      if (Math.abs(text.length - origLen) / origLen > LENGTH_TOLERANCE) {
        text = origSeg.text;
      }
    }
    return {
      text: text || origSeg.text,
      startTime: origSeg.startTime,
      endTime: origSeg.endTime,
      startTimeText: origSeg.startTimeText ?? null,
    };
  });

  // Ensure no overlaps in aligned segments by clamping to next segment's start
  for (let i = 0; i < aligned.length - 1; i++) {
    if (aligned[i].endTime > aligned[i + 1].startTime) {
      aligned[i].endTime = aligned[i + 1].startTime;
    }
  }

  return aligned;
}

/**
 * Chunk segments into groups by count
 */
export function chunkSegmentsByCount(
  segments: SubtitleSegment[],
  maxPerChunk: number
): [number, number][] {
  const ranges: [number, number][] = [];
  const n = segments.length;
  let start = 0;

  while (start < n) {
    const end = Math.min(start + maxPerChunk, n);
    ranges.push([start, end]);
    start = end;
  }

  return ranges;
}

/**
 * Parse refined text with chunk sentinels
 */
function parseWithChunks(
  refinedText: string,
  originalSegments: SubtitleSegment[],
  chunkSentinel: string,
  maxSegmentsPerChunk: number
): SubtitleSegment[] {
  let rawBlocks = refinedText.split(chunkSentinel);
  const ranges = chunkSegmentsByCount(originalSegments, maxSegmentsPerChunk);

  while (rawBlocks.length < ranges.length) {
    rawBlocks.push("");
  }

  const finalSegments: SubtitleSegment[] = [];

  for (let i = 0; i < ranges.length; i++) {
    const [startIdx, endIdx] = ranges[i];
    const blockText = rawBlocks[i];
    const origChunk = originalSegments.slice(startIdx, endIdx);

    const lines = blockText
      .trim()
      .split("\n")
      .filter((x) => x.trim())
      .map((x) => x.split(/\s+/).join(" "));

    const refinedTextsChunk = lines.map(normalizeLineToText).filter((t) => t);

    if (refinedTextsChunk.length !== origChunk.length) {
      console.warn(
        `Parser chunk ${i + 1}/${ranges.length} warning: ` +
          `expected ${origChunk.length} lines, got ${refinedTextsChunk.length}`
      );
    }

    const aligned = dpAlignSegments(origChunk, refinedTextsChunk, true);
    finalSegments.push(...aligned);
  }

  return finalSegments;
}

/**
 * Parse refined text without sentinels
 */
function parseGlobal(refinedText: string, originalSegments: SubtitleSegment[]): SubtitleSegment[] {
  const refinedTexts = refinedText
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map(normalizeLineToText)
    .filter((t) => t.trim().length > 0);

  if (refinedTexts.length !== originalSegments.length) {
    console.warn(
      `Parser warning: Expected ${originalSegments.length} lines, ` +
        `got ${refinedTexts.length} lines`
    );
  }

  return dpAlignSegments(originalSegments, refinedTexts, false);
}

/**
 * Parse refined transcript back into segments with timestamps
 */
export function parseRefinedSegments(
  refinedText: string,
  originalSegments: SubtitleSegment[],
  chunkSentinel: string,
  maxSegmentsPerChunk: number
): SubtitleSegment[] {
  if (!refinedText) return [];

  if (refinedText.includes(chunkSentinel)) {
    return parseWithChunks(refinedText, originalSegments, chunkSentinel, maxSegmentsPerChunk);
  } else {
    return parseGlobal(refinedText, originalSegments);
  }
}
