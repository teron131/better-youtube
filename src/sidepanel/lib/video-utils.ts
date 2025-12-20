/**
 * Video processing utilities
 */

import { extractVideoId } from '@/lib/url';
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
 * Get current YouTube video tab
 */
export async function getCurrentVideoTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab?.url?.includes("youtube.com/watch")) {
        resolve(currentTab);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get video ID from current active tab
 */
export async function getVideoIdFromCurrentTab(): Promise<string> {
  try {
    const tab = await getCurrentVideoTab();
    if (!tab?.url) return '';

    const videoId = extractVideoId(tab.url);
    if (videoId && VIDEO_ID_REGEX.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch (error) {
    console.error('Error getting video ID from tab:', error);
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
