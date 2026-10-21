/**
 * Maps model-refined caption lines back onto the original timed segments, so a dropped, merged, or bloated line falls back to its source text instead of shifting every later caption.
 */

import { SEGMENT_PARSER_CONFIG } from "@/core/constants";
import type { SubtitleSegment } from "@/core/storage";

/** Order-insensitive: counts the shorter string's characters that appear anywhere in the longer one, a cheap stand-in for edit similarity. */
function computeCharSimilarity(a: string, b: string): number {
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  if (!longer.length) return 1.0;
  const longerChars = new Set(longer);
  const matches = [...shorter].filter((c) => longerChars.has(c)).length;
  return matches / longer.length;
}

/** Jaccard overlap of ASCII word tokens, so Chinese and other non-Latin lines score 0 and rely on character similarity. */
function computeTokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.toLowerCase().match(/[a-z0-9']+/gi) || []);
  const bTokens = new Set(b.toLowerCase().match(/[a-z0-9']+/gi) || []);
  const intersection = new Set([...aTokens].filter((x) => bTokens.has(x)));
  const union = new Set([...aTokens, ...bTokens]);
  return union.size ? intersection.size / union.size : 0.0;
}

function computeLineSimilarity(a: string, b: string): number {
  if (!a || !b) return 0.0;
  return 0.7 * computeCharSimilarity(a, b) + 0.3 * computeTokenSimilarity(a, b);
}

/** Drops the timestamp prefix the refiner prompt adds and collapses whitespace: "[1:05]  hello   world" → "hello world". */
function normalizeLineToText(line: string): string {
  const normalized = line.split(/\s+/).join(" ").trim();
  const timestampMatch = normalized.match(/^\[[^\]]+\]\s*(.*)$/);
  return timestampMatch ? timestampMatch[1].trim() : normalized;
}

function isSuspiciouslyLongRefinement(originalText: string, refinedText: string): boolean {
  const originalLength = originalText.trim().length;
  const refinedLength = refinedText.trim().length;
  const { MAX_REFINED_LENGTH_RATIO, MAX_REFINED_LENGTH_EXTRA_CHARS } = SEGMENT_PARSER_CONFIG;
  const maxAllowedLength = Math.max(
    originalLength * MAX_REFINED_LENGTH_RATIO,
    originalLength + MAX_REFINED_LENGTH_EXTRA_CHARS,
  );

  return refinedLength > maxAllowedLength;
}

/**
 * Returns one segment per original with that original's start time; only the text can come from the refinement.
 * 1. Scores a global alignment: a pair ("M") earns its line similarity, and skipping an original ("O") or refined ("R") line costs GAP_PENALTY.
 * 2. Backtracks into an original → refined mapping; originals left unmatched keep their own text.
 * 3. Keeps the original text instead when a refinement balloons in length or, with applyTailGuard, changes length by more than LENGTH_TOLERANCE in the last TAIL_GUARD_SIZE segments.
 * 4. Clamps each end time to the next start so captions never overlap.
 */
function dpAlignSegments(
  origSegments: SubtitleSegment[],
  refTexts: string[],
  applyTailGuard = false,
): SubtitleSegment[] {
  const nOrig = origSegments.length;
  const nRef = refTexts.length;
  if (nOrig === 0) return [];

  const { GAP_PENALTY, TAIL_GUARD_SIZE, LENGTH_TOLERANCE } = SEGMENT_PARSER_CONFIG;

  const dp: number[][] = Array(nOrig + 1)
    .fill(null)
    .map(() => Array(nRef + 1).fill(-Infinity));
  const back: (string | null)[][] = Array(nOrig + 1)
    .fill(null)
    .map(() => Array(nRef + 1).fill(null));
  dp[0][0] = 0.0;
  for (let i = 1; i <= nOrig; i++) {
    dp[i][0] = dp[i - 1][0] + GAP_PENALTY;
    back[i][0] = "O";
  }
  for (let j = 1; j <= nRef; j++) {
    dp[0][j] = dp[0][j - 1] + GAP_PENALTY;
    back[0][j] = "R";
  }

  for (let i = 1; i <= nOrig; i++) {
    const origText = origSegments[i - 1].text;
    for (let j = 1; j <= nRef; j++) {
      const refText = refTexts[j - 1];
      let bestScore = dp[i - 1][j - 1] + computeLineSimilarity(origText, refText);
      let bestPtr = "M";
      const oScore = dp[i - 1][j] + GAP_PENALTY;
      if (oScore > bestScore) {
        bestScore = oScore;
        bestPtr = "O";
      }
      const rScore = dp[i][j - 1] + GAP_PENALTY;
      if (rScore > bestScore) {
        bestScore = rScore;
        bestPtr = "R";
      }
      dp[i][j] = bestScore;
      back[i][j] = bestPtr;
    }
  }

  const mapping: (number | null)[] = Array(nOrig).fill(null);
  let i = nOrig,
    j = nRef;
  while (i > 0 || j > 0) {
    const ptr = back[i][j];
    if (ptr === "M" && i > 0 && j > 0) {
      mapping[i - 1] = j - 1;
      i--;
      j--;
    } else if (ptr === "O" && i > 0) {
      mapping[i - 1] = null;
      i--;
    } else if (ptr === "R" && j > 0) {
      j--;
    } else if (i > 0) {
      mapping[i - 1] = null;
      i--;
    } else if (j > 0) {
      j--;
    } else break;
  }

  const tailStart = applyTailGuard ? nOrig - TAIL_GUARD_SIZE : nOrig + 1;
  const aligned = origSegments.map((origSeg, idx) => {
    const refIdx = mapping[idx];
    let text = refIdx !== null && refIdx >= 0 && refIdx < nRef ? refTexts[refIdx] : origSeg.text;
    if (text && isSuspiciouslyLongRefinement(origSeg.text, text)) {
      text = origSeg.text;
    } else if (idx >= tailStart && text) {
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

  for (let i = 0; i < aligned.length - 1; i++) {
    if (aligned[i].endTime > aligned[i + 1].startTime) {
      aligned[i].endTime = aligned[i + 1].startTime;
    }
  }

  return aligned;
}

/** Returns half-open [start, end) index ranges, not the segments themselves. */
export function chunkSegmentsByCount(
  segments: SubtitleSegment[],
  maxPerChunk: number,
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

/** Aligns each sentinel-delimited block only against its own chunk, so one malformed chunk cannot shift captions in the others; a missing block keeps the original text. */
function parseWithChunks(
  refinedText: string,
  originalSegments: SubtitleSegment[],
  chunkSentinel: string,
  maxSegmentsPerChunk: number,
): SubtitleSegment[] {
  const rawBlocks = refinedText.split(chunkSentinel);
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
          `expected ${origChunk.length} lines, got ${refinedTextsChunk.length}. ` +
          `Using segment alignment to preserve the rest of the chunk.`,
      );
    }

    const aligned = dpAlignSegments(origChunk, refinedTextsChunk, true);
    finalSegments.push(...aligned);
  }

  return finalSegments;
}

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
        `got ${refinedTexts.length} lines`,
    );
  }

  return dpAlignSegments(originalSegments, refinedTexts, false);
}

/** Timing always comes from originalSegments; maxSegmentsPerChunk must match the chunking that produced the sentinel-joined text. */
export function parseRefinedSegments(
  refinedText: string,
  originalSegments: SubtitleSegment[],
  chunkSentinel: string,
  maxSegmentsPerChunk: number,
): SubtitleSegment[] {
  if (!refinedText) return [];

  if (refinedText.includes(chunkSentinel)) {
    return parseWithChunks(refinedText, originalSegments, chunkSentinel, maxSegmentsPerChunk);
  } else {
    return parseGlobal(refinedText, originalSegments);
  }
}
