/**
 * Chrome Extension Messaging Service
 * Handles communication with background script for video processing
 */

import { ChromeMessage, sendChromeMessage } from '@/lib/chromeUtils';
import { MESSAGE_ACTIONS, TIMING } from '@/lib/constants';
import { extractVideoId } from '@/lib/url';
import { getApiKeys, getModelSettings } from './configLoaders';
import { ApiError, StreamingProcessingResult, StreamingProgressState } from './types';

/**
 * Handle scraping step
 */
async function performScrape(
  videoId: string,
  url: string,
  scrapeCreatorsApiKey: string,
  onProgress?: (state: StreamingProgressState) => void
): Promise<any> {
  onProgress?.({ step: 'scraping', stepName: 'Fetching Transcript', status: 'processing', message: 'Fetching video transcript...' });
  
  const result = await sendChromeMessage({
    action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
    videoId,
    scrapeCreatorsApiKey
  });

  if (result.status !== 'success') throw new Error('Failed to fetch video data');

  const videoInfo = result.videoInfo;
  onProgress?.({
    step: 'scraping',
    stepName: 'Fetching Transcript',
    status: 'completed',
    message: 'Video data fetched',
    data: {
      videoInfo: videoInfo ? {
        url: videoInfo.url || url,
        title: videoInfo.title || null,
        thumbnail: videoInfo.thumbnail || null,
        author: videoInfo.author || null,
        duration: videoInfo.duration || null,
        upload_date: videoInfo.upload_date || null,
        view_count: videoInfo.view_count ?? null,
        like_count: videoInfo.like_count ?? null
      } : undefined
    }
  });
  return videoInfo;
}

/**
 * Trigger caption refinement
 */
function triggerRefinement(
  videoId: string,
  scrapeCreatorsApiKey: string,
  openRouterApiKey: string,
  refinerModel: string
): void {
  sendChromeMessage({
    action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
    videoId,
    scrapeCreatorsApiKey,
    openRouterApiKey,
    modelSelection: refinerModel
  }).catch(err => console.error('Caption refinement error:', err));
}

/**
 * Stream analysis: Scrape → Refine (if enabled) + Summarize in parallel
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
  const formatTime = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

  try {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const [{ scrapeCreatorsApiKey, openRouterApiKey }, { summarizerModel, refinerModel, targetLanguage, showSubtitles }] = 
      await Promise.all([getApiKeys(), getModelSettings()]);

    if (!scrapeCreatorsApiKey) throw new Error('Scrape Creators API key not configured');
    if (!openRouterApiKey) throw new Error('OpenRouter API key not configured');

    let videoInfo: any = null;
    if (!options.transcript) {
      videoInfo = await performScrape(videoId, url, scrapeCreatorsApiKey, onProgress);
      if (showSubtitles) triggerRefinement(videoId, scrapeCreatorsApiKey, openRouterApiKey, refinerModel);
    } else {
      onProgress?.({ step: 'scraping', stepName: 'Fetching Transcript', status: 'completed', message: 'Using provided transcript' });
    }

    onProgress?.({ step: 'analyzing', stepName: 'Analyzing', status: 'processing', message: 'Generating summary...' });

    const summaryResult = await new Promise<StreamingProcessingResult>((resolve, reject) => {
      const cleanup = () => {
        chrome.runtime.onMessage.removeListener(listener);
        clearTimeout(timeoutId);
      };

      const listener = (msg: ChromeMessage) => {
        if (msg.action === MESSAGE_ACTIONS.SUMMARY_GENERATED && msg.videoId === videoId) {
          cleanup();
          const { summary, videoInfo: msgVideoInfo, transcript } = msg;
          if (!summary) return reject({ message: 'No summary data received', type: 'processing' } as ApiError);

          onProgress?.({ step: 'complete', stepName: 'Complete', status: 'completed', message: 'Summary generated successfully' });
          const vi = msgVideoInfo || videoInfo || {};
          resolve({
            success: true,
            videoInfo: {
              url: vi.url || url,
              title: vi.title || null,
              thumbnail: vi.thumbnail || null,
              author: vi.author || null,
              duration: vi.duration || null,
              upload_date: vi.upload_date || null,
              view_count: vi.view_count || null,
              like_count: vi.like_count || null
            },
            transcript: transcript || null,
            analysis: summary.analysis,
            quality: summary.quality,
            summaryText: summary.summary_text,
            qualityScore: summary.quality_score,
            totalTime: '0s',
            iterationCount: summary.iteration_count || 0,
            chunksProcessed: 0,
          });
        } else if (msg.action === MESSAGE_ACTIONS.SHOW_ERROR) {
          cleanup();
          reject({ message: msg.error || 'Processing failed', type: 'processing' } as ApiError);
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      
      const timeoutId = setTimeout(() => {
        cleanup();
        reject({ message: 'Processing timeout after 2 minutes', type: 'processing' } as ApiError);
      }, TIMING.PROCESSING_TIMEOUT_MS);

      sendChromeMessage({
        action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
        videoId,
        transcript: options.transcript,
        scrapeCreatorsApiKey,
        openRouterApiKey,
        modelSelection: options.analysisModel || summarizerModel,
        qualityModel: options.qualityModel,
        refinerModel,
        targetLanguage: options.targetLanguage || targetLanguage,
        fastMode: options.fastMode,
        forceRegenerate: options.forceRegenerate,
      })
        .then(r => {
          if (r?.status === 'error') {
            cleanup();
            reject({ message: r.message || 'Processing failed', type: 'processing' } as ApiError);
          }
        })
        .catch(err => {
          cleanup();
          reject({ message: err.message || 'Failed to start summarization', type: 'network' } as ApiError);
        });
    });

    return { ...summaryResult, totalTime: formatTime() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const apiError: ApiError = { message: msg, type: 'processing' };
    onProgress?.({ step: 'analyzing', stepName: 'Processing', status: 'error', message: msg, error: apiError });
    return { success: false, totalTime: formatTime(), iterationCount: 0, chunksProcessed: 0, error: apiError };
  }
}
