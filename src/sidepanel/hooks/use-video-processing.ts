/**
 * Core video processing state management hook with streaming support.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { ApiError, StreamingProcessingResult, VideoInfoResponse } from "@/core/types";
import { streamSummary } from "@/sidepanel/services/streaming";

export interface VideoProcessingOptions {
  summaryModel?: string;
  targetLanguage?: string;
  transcript?: string;
  forceRegenerate?: boolean;
}

export interface VideoProcessingState {
  isLoading: boolean;
  error: ApiError | null;
  summaryResult: StreamingProcessingResult | null;
  scrapedVideoInfo: VideoInfoResponse | null;
  scrapedTranscript: string | null;
}

const INITIAL_STATE: VideoProcessingState = {
  isLoading: false,
  error: null,
  summaryResult: null,
  scrapedVideoInfo: null,
  scrapedTranscript: null,
};

const LOADING_STATE: VideoProcessingState = { ...INITIAL_STATE, isLoading: true };

function buildFailedResult(error: ApiError): StreamingProcessingResult {
  return { success: false, error };
}

type Action =
  | { type: "START" }
  | { type: "VIDEO_INFO"; payload: VideoInfoResponse }
  | { type: "COMPLETE"; payload: StreamingProcessingResult }
  | { type: "ERROR"; payload: ApiError }
  | { type: "UPDATE"; payload: Partial<VideoProcessingState> };

function reducer(state: VideoProcessingState, action: Action): VideoProcessingState {
  switch (action.type) {
    case "START":
      return LOADING_STATE;

    case "VIDEO_INFO":
      return { ...state, scrapedVideoInfo: action.payload };

    case "COMPLETE":
      return {
        ...state,
        scrapedVideoInfo: action.payload.videoInfo || state.scrapedVideoInfo,
        scrapedTranscript: action.payload.transcript || state.scrapedTranscript,
        summaryResult: action.payload,
        isLoading: false,
      };

    case "ERROR":
      return { ...state, isLoading: false, error: action.payload };

    case "UPDATE":
      return { ...state, ...action.payload };

    default:
      return state;
  }
}

export function useVideoProcessing() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const runTokenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const cancelCurrentRun = useCallback(() => {
    runTokenRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const processVideo = useCallback(
    async (url: string, options?: VideoProcessingOptions): Promise<StreamingProcessingResult> => {
      const runToken = runTokenRef.current + 1;
      runTokenRef.current = runToken;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: "START" });

      try {
        const result = await streamSummary(
          url,
          options || {},
          (videoInfo) => {
            if (runToken !== runTokenRef.current) {
              return;
            }
            dispatch({ type: "VIDEO_INFO", payload: videoInfo });
          },
          { signal: controller.signal, runId: String(runToken) },
        );

        if (runToken !== runTokenRef.current) {
          return buildFailedResult({
            message: "Processing cancelled",
            type: "processing",
          });
        }

        if (!result.success) {
          const error = result.error || {
            message: "Processing failed",
            type: "processing",
          };
          dispatch({ type: "ERROR", payload: error });
          return result;
        }

        dispatch({ type: "COMPLETE", payload: result });
        return result;
      } catch (e) {
        if (runToken !== runTokenRef.current) {
          return buildFailedResult({
            message: "Processing cancelled",
            type: "processing",
          });
        }
        const error: ApiError = {
          message:
            typeof e === "object" && e !== null && "message" in e
              ? String((e as Record<string, unknown>).message)
              : "Processing failed",
          type: "processing",
        };
        dispatch({ type: "ERROR", payload: error });
        return buildFailedResult(error);
      } finally {
        if (runToken === runTokenRef.current && abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [],
  );

  return {
    ...state,
    processVideo,
    cancelCurrentRun,
    updateState: useCallback(
      (updates: Partial<VideoProcessingState>) => dispatch({ type: "UPDATE", payload: updates }),
      [],
    ),
  };
}
