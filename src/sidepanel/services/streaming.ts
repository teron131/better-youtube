/**
 * Chrome Extension Messaging Service
 * Handles communication with background script for video processing
 */

import { extractVideoId } from '@/lib/url';
import {
  ApiError,
  StreamingProcessingResult,
  StreamingProgressState,
} from './types';
import { getApiKeys, getModelSettings } from './configLoaders';
import { executeScrapeStep, triggerCaptionRefinement, executeSummarizeStep } from './streamingSteps';

/**
 * Stream analysis using Chrome messaging to background script
 * Flow: 1) Scrape video first, 2) Then refine (if captions enabled) + summarize in parallel
 */
export async function streamAnalysis(
  url: string,
  options: {
    analysisModel?: string;
    qualityModel?: string;
    targetLanguage?: string | null;
    fastMode?: boolean;
    transcript?: string;
    forceRegenerate?: boolean;
  },
  onProgress?: (state: StreamingProgressState) => void
): Promise<StreamingProcessingResult> {
  const startTime = Date.now();

  try {
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Get API keys and settings
    const { scrapeCreatorsApiKey, openRouterApiKey } = await getApiKeys();
    const { summarizerModel, refinerModel, targetLanguage, showSubtitles } = await getModelSettings();

    if (!scrapeCreatorsApiKey) {
      throw new Error('Scrape Creators API key not configured');
    }

    if (!openRouterApiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Step 1: Scrape video data first (unless transcript is already provided)
    let scrapedVideoInfo: any = null;

    if (!options.transcript) {
      const scrapeResult = await executeScrapeStep(url, videoId, scrapeCreatorsApiKey, onProgress);
      scrapedVideoInfo = scrapeResult.scrapedVideoInfo;
    } else {
      onProgress?.({
        step: 'scraping',
        stepName: 'Fetching Transcript',
        status: 'completed',
        message: 'Using provided transcript',
      });
    }

    // Step 2: Trigger refine (if captions enabled) + summarize in parallel
    if (showSubtitles && !options.transcript) {
      triggerCaptionRefinement(videoId, scrapeCreatorsApiKey, openRouterApiKey, refinerModel);
    }

    // Step 3: Execute summarization and wait for completion
    const result = await executeSummarizeStep(
      url,
      videoId,
      options.transcript,
      scrapeCreatorsApiKey,
      openRouterApiKey,
      options.analysisModel || summarizerModel,
      options.qualityModel,
      refinerModel,
      options.targetLanguage || targetLanguage,
      options.fastMode,
      options.forceRegenerate,
      scrapedVideoInfo,
      onProgress
    );

    // Add elapsed time to result
    return {
      ...result,
      totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const apiError: ApiError = { message: msg, type: 'processing' };

    onProgress?.({
      step: 'analyzing',
      stepName: 'Processing',
      status: 'error',
      message: msg,
      error: apiError,
    });

    return {
      success: false,
      totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      iterationCount: 0,
      chunksProcessed: 0,
      error: apiError,
    };
  }
}
