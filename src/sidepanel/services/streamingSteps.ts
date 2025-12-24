/**
 * Streaming Processing Steps
 * Breaks down the analysis flow into focused, single-responsibility steps
 */

import { MESSAGE_ACTIONS } from '@/lib/constants';
import {
  ApiError,
  StreamingProcessingResult,
  StreamingProgressState,
} from './types';

/**
 * Execute the scrape step: fetch video data and cache it
 */
export async function executeScrapeStep(
  url: string,
  videoId: string,
  scrapeCreatorsApiKey: string,
  onProgress?: (state: StreamingProgressState) => void
): Promise<{ scrapedTranscript: string | null; scrapedVideoInfo: any }> {
  onProgress?.({
    step: 'scraping',
    stepName: 'Fetching Transcript',
    status: 'processing',
    message: 'Fetching video transcript...',
  });

  // Wait for scrape to complete
  const scrapeResult = await new Promise<{ status: string; videoInfo?: any; hasTranscript?: boolean }>((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
        videoId,
        scrapeCreatorsApiKey,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Scrape error:', chrome.runtime.lastError.message);
          resolve({ status: 'error' });
        } else {
          resolve(response || { status: 'error' });
        }
      }
    );
  });

  if (scrapeResult.status !== 'success') {
    throw new Error('Failed to fetch video data');
  }

  const scrapedVideoInfo = scrapeResult.videoInfo;

  onProgress?.({
    step: 'scraping',
    stepName: 'Fetching Transcript',
    status: 'completed',
    message: 'Video data fetched',
    data: {
      videoInfo: scrapedVideoInfo ? {
        url: scrapedVideoInfo.url || url,
        title: scrapedVideoInfo.title || null,
        thumbnail: scrapedVideoInfo.thumbnail || null,
        author: scrapedVideoInfo.author || null,
        duration: scrapedVideoInfo.duration || null,
        upload_date: scrapedVideoInfo.upload_date || null,
        view_count: scrapedVideoInfo.view_count ?? null,
        like_count: scrapedVideoInfo.like_count ?? null,
      } : undefined,
    },
  });

  return {
    scrapedTranscript: null,
    scrapedVideoInfo,
  };
}

/**
 * Trigger caption refinement (fire-and-forget, non-blocking)
 */
export function triggerCaptionRefinement(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  refinerModel: string
): void {
  chrome.runtime.sendMessage(
    {
      action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
      videoId,
      scrapeCreatorsApiKey,
      openRouterApiKey,
      modelSelection: refinerModel,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Caption refinement error:', chrome.runtime.lastError.message);
      } else {
        console.log('Caption refinement triggered:', response);
      }
    }
  );
}

/**
 * Execute the summarize step: trigger and wait for completion
 */
export async function executeSummarizeStep(
  url: string,
  videoId: string,
  transcript: string | null | undefined,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  analysisModel: string,
  qualityModel: string | undefined,
  refinerModel: string,
  targetLanguage: string | null | undefined,
  fastMode: boolean | undefined,
  forceRegenerate: boolean | undefined,
  scrapedVideoInfo: any,
  onProgress?: (state: StreamingProgressState) => void
): Promise<StreamingProcessingResult> {
  onProgress?.({
    step: 'analyzing',
    stepName: 'Analyzing',
    status: 'processing',
    message: 'Generating summary...',
  });

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
        videoId,
        transcript,
        scrapeCreatorsApiKey,
        openRouterApiKey,
        modelSelection: analysisModel,
        qualityModel,
        refinerModel,
        targetLanguage,
        fastMode,
        forceRegenerate,
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
      }
    );

    // Listen for summary completion
    const messageListener = (message: any) => {
      if (message.action === MESSAGE_ACTIONS.SUMMARY_GENERATED && message.videoId === videoId) {
        chrome.runtime.onMessage.removeListener(messageListener);

        const { summary, videoInfo, transcript: resultTranscript } = message;

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
            } : scrapedVideoInfo ? {
              url: scrapedVideoInfo.url || url,
              title: scrapedVideoInfo.title || null,
              thumbnail: scrapedVideoInfo.thumbnail || null,
              author: scrapedVideoInfo.author || null,
              duration: scrapedVideoInfo.duration || null,
              upload_date: scrapedVideoInfo.upload_date || null,
              view_count: scrapedVideoInfo.view_count || null,
              like_count: scrapedVideoInfo.like_count || null,
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
            transcript: resultTranscript || null,
            analysis: summary.analysis,
            quality: summary.quality,
            summaryText: summary.summary_text,
            qualityScore: summary.quality_score,
            totalTime: '0s', // Will be set by caller
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
}
