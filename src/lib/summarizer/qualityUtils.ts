import type { Quality } from "./schemas";
import { DEFAULTS } from "../constants";
import { QUALITY_THRESHOLDS } from "../chromeConstants";

const SCORE_MAP = QUALITY_THRESHOLDS.SCORE_MAP;
const MAX_SCORE_PER_ASPECT = QUALITY_THRESHOLDS.MAX_SCORE_PER_ASPECT;

export const ANALYSIS_CONFIG = {
  MODEL: DEFAULTS.MODEL_SUMMARIZER,
  QUALITY_MODEL: DEFAULTS.MODEL_SUMMARIZER,
  MIN_QUALITY_SCORE: QUALITY_THRESHOLDS.MIN_QUALITY_SCORE,
  MAX_ITERATIONS: QUALITY_THRESHOLDS.MAX_ITERATIONS,
} as const;

/**
 * Calculate percentage quality score from quality assessment
 * Updated to use 6 aspects aligned with Python backend
 */
function calculateScore(quality: Quality): number {
  const aspects = [
    quality.completeness,
    quality.structure,
    quality.no_garbage,
    quality.meta_language_avoidance,
    quality.useful_keywords,
    quality.correct_language,
  ];

  const totalScore = aspects.reduce((sum, aspect) => sum + SCORE_MAP[aspect.rate], 0);
  const maxPossibleScore = aspects.length * MAX_SCORE_PER_ASPECT;

  return Math.round((totalScore / maxPossibleScore) * 100);
}

/**
 * Check if quality score meets minimum threshold
 */
function isAcceptable(quality: Quality): boolean {
  return calculateScore(quality) >= ANALYSIS_CONFIG.MIN_QUALITY_SCORE;
}

/**
 * Log detailed quality breakdown to console
 */
function printQualityBreakdown(quality: Quality): void {
  const score = calculateScore(quality);

  console.log("📈 Quality breakdown:");
  console.log(`Completeness: ${quality.completeness.rate} - ${quality.completeness.reason}`);
  console.log(`Structure: ${quality.structure.rate} - ${quality.structure.reason}`);
  console.log(`No Garbage: ${quality.no_garbage.rate} - ${quality.no_garbage.reason}`);
  console.log(
    `Meta Language Avoidance: ${quality.meta_language_avoidance.rate} - ${quality.meta_language_avoidance.reason}`
  );
  console.log(
    `Useful Keywords: ${quality.useful_keywords.rate} - ${quality.useful_keywords.reason}`
  );
  console.log(
    `Correct Language: ${quality.correct_language.rate} - ${quality.correct_language.reason}`
  );
  console.log(`Total Score: ${score}%`);

  if (!isAcceptable(quality)) {
    console.log(
      `⚠️  Quality below threshold (${ANALYSIS_CONFIG.MIN_QUALITY_SCORE}%), refinement needed`
    );
  }
}

export { calculateScore, isAcceptable, printQualityBreakdown };
