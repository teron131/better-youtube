/**
 * Streaming Service
 * Handles Server-Sent Events (SSE) for real-time analysis
 */

import { api } from './api';
import {
  AnalysisData,
  ApiError,
  QualityData,
  StreamingChunk,
  StreamingProcessingResult,
  StreamingProgressState,
  SummarizeRequest,
  VideoInfoResponse,
} from './types';

// --- Types & Constants ---

type ChunkHandler = (data: StreamingChunk) => StreamingProgressState | null;

const createCompleteHandler = (): ChunkHandler => (data) => {
  if (data.type !== 'complete' && !data.is_complete) return null;
  const qualityScore = data.quality?.percentage_score;
  return {
    step: 'complete',
    stepName: 'Analysis Complete',
    status: 'completed',
    message: qualityScore !== undefined
      ? `Analysis completed successfully with ${qualityScore}% quality score`
      : 'Analysis completed successfully',
    iterationCount: data.iteration_count,
    qualityScore,
  };
};

const createQualityHandler = (): ChunkHandler => (data) => {
  if (!data.quality?.percentage_score) return null;
  const { percentage_score: score, is_acceptable: passed } = data.quality;
  return {
    step: passed ? 'quality_check' : 'refinement',
    stepName: passed ? 'Quality Check' : 'Refining',
    status: 'processing',
    message: passed ? 'Quality check passed' : 'Refining analysis...',
    qualityScore: score,
    iterationCount: data.iteration_count,
  };
};

const createAnalysisHandler = (): ChunkHandler => (data) => {
  if (!data.analysis || data.quality) return null;
  return {
    step: 'analysis_generation',
    stepName: 'Analysis Generation',
    status: 'completed',
    message: 'Analysis generated',
    iterationCount: data.iteration_count,
  };
};

const CHUNK_HANDLERS: ChunkHandler[] = [
  createCompleteHandler(),
  createQualityHandler(),
  createAnalysisHandler(),
];

// --- Helper Functions ---

function processChunk(data: StreamingChunk, onProgress?: (state: StreamingProgressState) => void): void {
  if (data.type === 'status') return;
  for (const handler of CHUNK_HANDLERS) {
    const state = handler(data);
    if (state) {
      onProgress?.(state);
      return;
    }
  }
}

async function performScraping(url: string, onProgress?: (state: StreamingProgressState) => void) {
  onProgress?.({
    step: 'scraping',
    stepName: 'Scraping Video',
    status: 'processing',
    message: 'Extracting video info...',
  });

  const scrapResult = await api.scrapVideo({ url });
  if (scrapResult.status !== 'success') {
    throw new Error(scrapResult.message || 'Scraping failed');
  }

  const videoInfo: VideoInfoResponse = {
    url: scrapResult.url || url,
    title: scrapResult.title || null,
    thumbnail: scrapResult.thumbnail,
    author: scrapResult.author || null,
    duration: scrapResult.duration,
    upload_date: scrapResult.upload_date,
    view_count: scrapResult.view_count,
    like_count: scrapResult.like_count,
  };

  onProgress?.({
    step: 'scraping',
    stepName: 'Scraping Video',
    status: 'completed',
    message: `Video scraped: ${videoInfo.title}`,
    data: { videoInfo, transcript: scrapResult.transcript },
  });

  return { scrapResult, videoInfo };
}

// --- Main Function ---

export async function streamAnalysis(
  url: string,
  options: {
    analysisModel?: string;
    qualityModel?: string;
    targetLanguage?: string | null;
    fastMode?: boolean;
  },
  onProgress?: (state: StreamingProgressState) => void,
): Promise<StreamingProcessingResult> {
  const startTime = Date.now();
  let iterationCount = 0;
  let chunksProcessed = 0;

  try {
    // 1. Scraping Phase
    const { scrapResult, videoInfo } = await performScraping(url, onProgress);

    // 2. Analysis Phase (Streaming)
    onProgress?.({
      step: 'analyzing',
      stepName: 'AI Analysis',
      status: 'processing',
      message: 'Connecting to analysis stream...',
    });

    const requestBody: SummarizeRequest = {
      content: scrapResult.transcript || url,
      content_type: scrapResult.transcript ? 'transcript' : 'url',
      analysis_model: options.analysisModel || 'google/gemini-2.5-pro',
      quality_model: options.qualityModel || 'google/gemini-2.5-flash',
      target_language: options.targetLanguage === 'auto' ? null : options.targetLanguage,
      fast_mode: options.fastMode || false,
    };

    const response = await fetch(`${api.baseUrl}/stream-summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error(`Stream connection failed: ${response.statusText}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let analysis: AnalysisData | undefined;
    let quality: QualityData | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      for (const line of chunkText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data: StreamingChunk = JSON.parse(line.slice(6));
          chunksProcessed++;
          if (data.analysis) analysis = data.analysis;
          if (data.quality) quality = data.quality;
          if (data.iteration_count) iterationCount = data.iteration_count;
          processChunk(data, onProgress);
        } catch {
          // Ignore partial chunks
        }
      }
    }

    return {
      success: true,
      videoInfo,
      transcript: scrapResult.transcript,
      analysis,
      quality,
      totalTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      iterationCount,
      chunksProcessed,
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
      iterationCount,
      chunksProcessed,
      error: apiError,
    };
  }
}
