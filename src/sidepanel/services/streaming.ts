/**
 * Chrome Extension Messaging Service
 * Handles communication with background script for video processing
 */

import { MESSAGE_ACTIONS, TIMING } from '@/lib/constants';
import { extractVideoId } from '@/lib/url';
import { ApiError, StreamingProcessingResult, StreamingProgressState } from './types';
import { getApiKeys, getModelSettings } from './configLoaders';

/** Stream analysis: Scrape → Refine (if enabled) + Summarize in parallel */
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
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const { scrapeCreatorsApiKey, openRouterApiKey } = await getApiKeys();
    const { summarizerModel, refinerModel, targetLanguage, showSubtitles } = await getModelSettings();
    if (!scrapeCreatorsApiKey) throw new Error('Scrape Creators API key not configured');
    if (!openRouterApiKey) throw new Error('OpenRouter API key not configured');

    // Step 1: Scrape (unless transcript provided)
    let scrapedVideoInfo: any = null;
    if (!options.transcript) {
      onProgress?.({ step: 'scraping', stepName: 'Fetching Transcript', status: 'processing', message: 'Fetching video transcript...' });
      const scrapeResult = await new Promise<{ status: string; videoInfo?: any }>((resolve) => {
        chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.SCRAPE_VIDEO, videoId, scrapeCreatorsApiKey }, (r) => {
          if (chrome.runtime.lastError) { console.error('Scrape error:', chrome.runtime.lastError.message); resolve({ status: 'error' }); }
          else resolve(r || { status: 'error' });
        });
      });
      if (scrapeResult.status !== 'success') throw new Error('Failed to fetch video data');
      scrapedVideoInfo = scrapeResult.videoInfo;
      onProgress?.({ step: 'scraping', stepName: 'Fetching Transcript', status: 'completed', message: 'Video data fetched',
        data: { videoInfo: scrapedVideoInfo ? { url: scrapedVideoInfo.url || url, title: scrapedVideoInfo.title || null, thumbnail: scrapedVideoInfo.thumbnail || null, author: scrapedVideoInfo.author || null, duration: scrapedVideoInfo.duration || null, upload_date: scrapedVideoInfo.upload_date || null, view_count: scrapedVideoInfo.view_count ?? null, like_count: scrapedVideoInfo.like_count ?? null } : undefined }
      });
    } else {
      onProgress?.({ step: 'scraping', stepName: 'Fetching Transcript', status: 'completed', message: 'Using provided transcript' });
    }

    // Step 2: Trigger refine (fire-and-forget) + summarize in parallel
    if (showSubtitles && !options.transcript) {
      chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.FETCH_SUBTITLES, videoId, scrapeCreatorsApiKey, openRouterApiKey, modelSelection: refinerModel }, (r) => {
        if (chrome.runtime.lastError) console.error('Caption refinement error:', chrome.runtime.lastError.message);
        else console.log('Caption refinement triggered:', r);
      });
    }

    // Step 3: Summarize and wait for completion
    onProgress?.({ step: 'analyzing', stepName: 'Analyzing', status: 'processing', message: 'Generating summary...' });
    const result = await new Promise<StreamingProcessingResult>((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: MESSAGE_ACTIONS.GENERATE_SUMMARY, videoId, transcript: options.transcript, scrapeCreatorsApiKey, openRouterApiKey,
        modelSelection: options.analysisModel || summarizerModel, qualityModel: options.qualityModel, refinerModel,
        targetLanguage: options.targetLanguage || targetLanguage, fastMode: options.fastMode, forceRegenerate: options.forceRegenerate,
      }, (r) => {
        if (chrome.runtime.lastError) { reject({ message: chrome.runtime.lastError.message || 'Chrome runtime error', type: 'network' } as ApiError); return; }
        if (r?.status === 'error') { reject({ message: r.message || 'Processing failed', type: 'processing' } as ApiError); return; }
      });

      const listener = (msg: any) => {
        if (msg.action === MESSAGE_ACTIONS.SUMMARY_GENERATED && msg.videoId === videoId) {
          chrome.runtime.onMessage.removeListener(listener);
          const { summary, videoInfo, transcript } = msg;
          if (summary) {
            onProgress?.({ step: 'complete', stepName: 'Complete', status: 'completed', message: 'Summary generated successfully' });
            const vi = videoInfo || scrapedVideoInfo || {};
            resolve({
              success: true,
              videoInfo: { url: vi.url || url, title: vi.title || null, thumbnail: vi.thumbnail || null, author: vi.author || null, duration: vi.duration || null, upload_date: vi.upload_date || null, view_count: vi.view_count || null, like_count: vi.like_count || null },
              transcript: transcript || null, analysis: summary.analysis, quality: summary.quality, summaryText: summary.summary_text,
              qualityScore: summary.quality_score, totalTime: '0s', iterationCount: summary.iteration_count || 0, chunksProcessed: 0,
            });
          } else reject({ message: 'No summary data received', type: 'processing' } as ApiError);
        } else if (msg.action === MESSAGE_ACTIONS.SHOW_ERROR) {
          chrome.runtime.onMessage.removeListener(listener);
          reject({ message: msg.error || 'Processing failed', type: 'processing' } as ApiError);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      setTimeout(() => { chrome.runtime.onMessage.removeListener(listener); reject({ message: 'Processing timeout after 2 minutes', type: 'processing' } as ApiError); }, TIMING.PROCESSING_TIMEOUT_MS);
    });

    return { ...result, totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const apiError: ApiError = { message: msg, type: 'processing' };
    onProgress?.({ step: 'analyzing', stepName: 'Processing', status: 'error', message: msg, error: apiError });
    return { success: false, totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`, iterationCount: 0, chunksProcessed: 0, error: apiError };
  }
}
