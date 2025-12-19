/**
 * Chrome Extension Messaging Service
 * Handles communication with background script for video processing
 */

import { MESSAGE_ACTIONS } from '@/lib/constants';
import { extractVideoIdFromUrl } from '@ui/lib/video-utils';
import {
  ApiError,
  StreamingProcessingResult,
  StreamingProgressState,
} from './types';

/**
 * Get API keys from chrome.storage
 */
async function getApiKeys(): Promise<{ scrapeCreatorsApiKey: string; openRouterApiKey: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['scrapeCreatorsApiKey', 'openRouterApiKey'], (result) => {
      resolve({
        scrapeCreatorsApiKey: result.scrapeCreatorsApiKey || '',
        openRouterApiKey: result.openRouterApiKey || '',
      });
    });
  });
}

/**
 * Get model settings from chrome.storage
 */
async function getModelSettings(): Promise<{
  summarizerModel: string;
  targetLanguage: string;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        'summarizerRecommendedModel',
        'summarizerCustomModel',
        'targetLanguageRecommended',
        'targetLanguageCustom',
      ],
      (result) => {
        const summarizerModel =
          result.summarizerCustomModel || result.summarizerRecommendedModel || 'x-ai/grok-4.1-fast';
        const targetLanguage =
          result.targetLanguageCustom || result.targetLanguageRecommended || 'auto';

        resolve({ summarizerModel, targetLanguage });
      }
    );
  });
}

/**
 * Stream analysis using Chrome messaging to background script
 */
export async function streamAnalysis(
  url: string,
  options: {
    analysisModel?: string;
    qualityModel?: string;
    targetLanguage?: string | null;
    fastMode?: boolean;
  },
  onProgress?: (state: StreamingProgressState) => void
): Promise<StreamingProcessingResult> {
  const startTime = Date.now();

  try {
    // Extract video ID from URL
    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Get API keys and settings
    const { scrapeCreatorsApiKey, openRouterApiKey } = await getApiKeys();
    const { summarizerModel, targetLanguage } = await getModelSettings();

    if (!scrapeCreatorsApiKey) {
      throw new Error('Scrape Creators API key not configured');
    }

    if (!openRouterApiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Update progress: Starting
    onProgress?.({
      step: 'scraping',
      stepName: 'Fetching Transcript',
      status: 'processing',
      message: 'Fetching video transcript...',
    });

    // Send message to background script to generate summary
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
          videoId,
          scrapeCreatorsApiKey,
          openRouterApiKey,
          modelSelection: options.analysisModel || summarizerModel,
          qualityModel: options.qualityModel,
          targetLanguage: options.targetLanguage || targetLanguage,
          fastMode: options.fastMode,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const error: ApiError = {
              message: chrome.runtime.lastError.message || 'Chrome runtime error',
              type: 'network',
            };
            reject(error);
            return;
          }

          if (response?.status === 'error') {
            const error: ApiError = {
              message: response.message || 'Processing failed',
              type: 'processing',
            };
            reject(error);
            return;
          }

          // Processing started, listen for completion
          onProgress?.({
            step: 'analyzing',
            stepName: 'Analyzing',
            status: 'processing',
            message: 'Generating summary...',
          });
        }
      );

      // Listen for summary completion
      const messageListener = (message: any) => {
        if (message.action === MESSAGE_ACTIONS.SUMMARY_GENERATED && message.videoId === videoId) {
          chrome.runtime.onMessage.removeListener(messageListener);

          const { summary, videoInfo, transcript } = message;

          if (summary) {
            onProgress?.({
              step: 'complete',
              stepName: 'Complete',
              status: 'completed',
              message: 'Summary generated successfully',
            });

            resolve({
              success: true,
              videoInfo: videoInfo ? {
                url: videoInfo.url || url,
                title: videoInfo.title || null,
                thumbnail: videoInfo.thumbnail || null,
                author: videoInfo.author || null,
                duration: videoInfo.duration || null,
                upload_date: videoInfo.upload_date || null,
                view_count: videoInfo.view_count || null,
                like_count: videoInfo.like_count || null,
              } : {
                url,
                title: null,
                thumbnail: null,
                author: null,
                duration: null,
                upload_date: null,
                view_count: null,
                like_count: null,
              },
              transcript: transcript || null,
              analysis: summary.analysis,
              quality: summary.quality,
              totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              iterationCount: summary.iteration_count || 0,
              chunksProcessed: 0,
            });
          } else {
            const error: ApiError = {
              message: 'No summary data received',
              type: 'processing',
            };
            reject(error);
          }
        } else if (message.action === MESSAGE_ACTIONS.SHOW_ERROR) {
          chrome.runtime.onMessage.removeListener(messageListener);

          const error: ApiError = {
            message: message.error || 'Processing failed',
            type: 'processing',
          };
          reject(error);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Timeout after 2 minutes
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject({
          message: 'Processing timeout after 2 minutes',
          type: 'processing',
        } as ApiError);
      }, 120000);
    });
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
