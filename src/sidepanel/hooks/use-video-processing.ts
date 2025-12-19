/**
 * Core video processing state management hook with streaming support.
 */

import { useReducer } from 'react';

import { findStepIndex, normalizeStepName, sortProgressStates } from '@ui/lib/video-utils';
import { streamAnalysis } from '@ui/services/streaming';
import {
  ApiError,
  StreamingProcessingResult,
  StreamingProgressState,
  VideoInfoResponse,
} from '@ui/services/types';

export interface VideoProcessingOptions {
  analysisModel?: string;
  qualityModel?: string;
  targetLanguage?: string;
  fastMode?: boolean;
}

export interface VideoProcessingState {
  isLoading: boolean;
  error: ApiError | null;
  currentStep: number;
  currentStage: string;
  progressStates: StreamingProgressState[];
  analysisResult: StreamingProcessingResult | null;
  scrapedVideoInfo: VideoInfoResponse | null;
  scrapedTranscript: string | null;
}

const INITIAL_STATE: VideoProcessingState = {
  isLoading: false,
  error: null,
  currentStep: 0,
  currentStage: '',
  progressStates: [],
  analysisResult: null,
  scrapedVideoInfo: null,
  scrapedTranscript: null,
};

const LOADING_STATE: VideoProcessingState = {
  isLoading: true,
  error: null,
  analysisResult: null,
  currentStep: 0,
  currentStage: 'Initializing...',
  progressStates: [],
  scrapedVideoInfo: null,
  scrapedTranscript: null,
};

type Action =
  | { type: 'START' }
  | { type: 'PROGRESS'; payload: StreamingProgressState }
  | { type: 'COMPLETE'; payload: StreamingProcessingResult }
  | { type: 'ERROR'; payload: ApiError }
  | { type: 'RESET' }
  | { type: 'UPDATE'; payload: Partial<VideoProcessingState> };

function reducer(state: VideoProcessingState, action: Action): VideoProcessingState {
  switch (action.type) {
    case 'START':
      return LOADING_STATE;

    case 'PROGRESS': {
      const progressState = action.payload;
      const normalizedStep = normalizeStepName(progressState.step);
      const stepIndex = findStepIndex(normalizedStep);
      
      const nextStates = [...state.progressStates];
      const normalizedProgress = { ...progressState, step: normalizedStep };
      const existingIndex = nextStates.findIndex(s => s.step === normalizedStep);

      if (existingIndex >= 0) {
        nextStates[existingIndex] = normalizedProgress;
      } else {
        nextStates.push(normalizedProgress);
      }

      return {
        ...state,
        currentStep: stepIndex >= 0 ? stepIndex : state.currentStep,
        currentStage: progressState.message,
        progressStates: sortProgressStates(nextStates),
        scrapedVideoInfo: progressState.data?.videoInfo ?? state.scrapedVideoInfo,
        scrapedTranscript: progressState.data?.transcript ?? state.scrapedTranscript,
      };
    }

    case 'COMPLETE':
      return {
        ...state,
        scrapedVideoInfo: action.payload.videoInfo || state.scrapedVideoInfo,
        scrapedTranscript: action.payload.transcript || state.scrapedTranscript,
        analysisResult: action.payload,
        currentStage: 'Processing completed',
        isLoading: false,
      };

    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'RESET':
      return INITIAL_STATE;

    case 'UPDATE':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}

export function useVideoProcessing() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const processVideo = async (
    url: string,
    options?: VideoProcessingOptions,
    onProgress?: (state: StreamingProgressState) => void,
  ): Promise<StreamingProcessingResult> => {
    dispatch({ type: 'START' });

    try {
      const result = await streamAnalysis(url, options || {}, (progress) => {
        dispatch({ type: 'PROGRESS', payload: progress });
        onProgress?.(progress);
      });

      if (!result.success) {
        throw result.error || new Error('Processing failed');
      }

      dispatch({ type: 'COMPLETE', payload: result });
      return result;
    } catch (e) {
      const error = e as ApiError;
      dispatch({ type: 'ERROR', payload: error });
      throw error;
    }
  };

  return {
    ...state,
    processVideo,
    updateState: (updates: Partial<VideoProcessingState>) => dispatch({ type: 'UPDATE', payload: updates }),
    resetState: () => dispatch({ type: 'RESET' }),
  };
}
