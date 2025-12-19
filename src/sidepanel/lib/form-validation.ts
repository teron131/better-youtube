/**
 * Form validation utilities
 */

import { isValidYouTubeUrl } from './url-utils';

/**
 * Validate YouTube URL input
 */
export function validateYouTubeUrl(url: string): { isValid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) return { isValid: true };

  if (!isValidYouTubeUrl(trimmed)) {
    return {
      isValid: false,
      error: 'Please enter a valid YouTube URL (youtube.com or youtu.be).',
    };
  }

  return { isValid: true };
}

/**
 * Check if form input is valid (for button enabling)
 */
export function isFormValid(url: string): boolean {
  const trimmed = url.trim();
  return !trimmed || isValidYouTubeUrl(trimmed);
}

/**
 * Prepare processing options for API
 */
export function prepareProcessingOptions(
  targetLanguage: string,
  analysisModel: string,
  qualityModel: string,
  fastMode: boolean,
) {
  return {
    analysisModel,
    qualityModel,
    ...(targetLanguage !== "auto" && { targetLanguage }),
    fastMode,
  };
}

