import type { Quality } from "./schemas";

const SCORE_MAP: Record<string, number> = { Fail: 0, Refine: 1, Pass: 2 };
const MAX_SCORE_PER_ASPECT = 2;

export const SUMMARY_CONFIG = {
  ANALYSIS_MODEL: "x-ai/grok-4.1-fast",
  QUALITY_MODEL: "x-ai/grok-4.1-fast",
  MIN_QUALITY_SCORE: 80,
  MAX_ITERATIONS: 2,
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
  return calculateScore(quality) >= SUMMARY_CONFIG.MIN_QUALITY_SCORE;
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
      `⚠️  Quality below threshold (${SUMMARY_CONFIG.MIN_QUALITY_SCORE}%), refinement needed`
    );
  }
}

export { calculateScore, isAcceptable, printQualityBreakdown };
