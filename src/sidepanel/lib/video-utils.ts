/**
 * Video processing utilities
 */

import { StreamingProgressState } from '@ui/services/types';

const VIDEO_ID_REGEX = /^[\w-]{11}$/;
const STEP_ORDER = ['scraping', 'analysis_generation', 'quality_check', 'refinement', 'complete'] as const;
type NormalizedStep = typeof STEP_ORDER[number];
const MILLION = 1000000;
const THOUSAND = 1000;

export const PROGRESS_STEPS = [
  {
    step: 'scraping',
    name: "Scraping Video",
    description: "Extracting video info and transcript using Scrape Creators",
  },
  {
    step: 'analysis_generation',
    name: "Analysis Generation",
    description: "Generating initial AI analysis with Gemini model",
  },
  {
    step: 'quality_check',
    name: "Quality Assessment",
    description: "Evaluating analysis quality and completeness",
  },
  {
    step: 'refinement',
    name: "Analysis Refinement",
    description: "Refining analysis based on quality feedback",
  },
  {
    step: 'complete',
    name: "Complete",
    description: "Analysis completed successfully",
  },
] as const;

/**
 * Extract video ID from URL query parameters
 */
export function getVideoIdFromParams(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v');

    if (videoId && VIDEO_ID_REGEX.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch (error) {
    console.error('Error parsing URL parameters:', error);
  }

  return '';
}

/**
 * Normalize step names for consistent UI display
 */
export function normalizeStepName(step: StreamingProgressState['step']): NormalizedStep {
  return step === 'analyzing' ? 'analysis_generation' : (step as NormalizedStep);
}

/**
 * Find step index in progress steps array
 */
export function findStepIndex(step: StreamingProgressState['step']): number {
  return PROGRESS_STEPS.findIndex(s => s.step === step);
}

/**
 * Sort progress states in correct order
 */
export function sortProgressStates(states: StreamingProgressState[]): StreamingProgressState[] {
  return [...states].sort((a, b) => {
    const stepA = normalizeStepName(a.step);
    const stepB = normalizeStepName(b.step);
    return STEP_ORDER.indexOf(stepA) - STEP_ORDER.indexOf(stepB);
  });
}

/**
 * Check if a step is completed in progress states
 */
export function isStepCompleted(
  states: StreamingProgressState[],
  step: StreamingProgressState['step'],
): boolean {
  return states.some((s) => s.step === step && s.status === 'completed');
}

/**
 * Check if a step is processing in progress states
 */
export function isStepProcessing(
  states: StreamingProgressState[],
  step: StreamingProgressState['step'],
): boolean {
  return states.some((s) => s.step === step && s.status === 'processing');
}

/**
 * Format duration string (e.g. PT1H2M3S -> 1:02:03)
 */
export function formatDuration(duration: string): string {
  if (!duration) return '0:00';

  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return duration;

  const hours = (match[1] || '').replace('H', '');
  const minutes = (match[2] || '').replace('M', '');
  const seconds = (match[3] || '').replace('S', '');

  const parts = [];
  if (hours) parts.push(hours);
  parts.push(minutes || (hours ? '00' : '0'));
  parts.push((seconds || '00').padStart(2, '0'));

  return parts.join(':');
}

/**
 * Format view count (e.g. 1000000 -> 1M)
 */
export function formatViewCount(count: number): string {
  if (!count) return '0';
  if (count >= MILLION) return `${(count / MILLION).toFixed(1)}M`;
  if (count >= THOUSAND) return `${(count / THOUSAND).toFixed(1)}K`;
  return count.toString();
}

/**
 * Get stage text from anchor index
 */
export function getStageText(anchor: number): string {
  const stages = [
    'Initializing',
    'Scraping',
    'Analyzing',
    'Quality Check',
    'Complete',
  ];
  return stages[anchor] || 'Processing';
}
