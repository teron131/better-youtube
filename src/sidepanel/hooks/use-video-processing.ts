/**
 * Core video processing state management hook with streaming support.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
    ApiError,
    StreamingProcessingResult,
    StreamingProgressState,
    VideoInfoResponse,
} from "@/core/types";
import {
    findStepIndex,
    normalizeStepName,
    sortProgressStates,
} from "@/sidepanel/lib/video-utils";
import { streamSummary } from "@/sidepanel/services/streaming";

export interface VideoProcessingOptions {
    summaryModel?: string;
    qualityModel?: string;
    targetLanguage?: string;
    transcript?: string;
    forceRegenerate?: boolean;
}

export interface VideoProcessingState {
    isLoading: boolean;
    error: ApiError | null;
    currentStep: number;
    currentStage: string;
    progressStates: StreamingProgressState[];
    summaryResult: StreamingProcessingResult | null;
    scrapedVideoInfo: VideoInfoResponse | null;
    scrapedTranscript: string | null;
}

const INITIAL_STATE: VideoProcessingState = {
    isLoading: false,
    error: null,
    currentStep: 0,
    currentStage: "",
    progressStates: [],
    summaryResult: null,
    scrapedVideoInfo: null,
    scrapedTranscript: null,
};

const LOADING_STATE: VideoProcessingState = {
    isLoading: true,
    error: null,
    summaryResult: null,
    currentStep: 0,
    currentStage: "Initializing...",
    progressStates: [],
    scrapedVideoInfo: null,
    scrapedTranscript: null,
};

type Action =
    | { type: "START" }
    | { type: "PROGRESS"; payload: StreamingProgressState }
    | { type: "COMPLETE"; payload: StreamingProcessingResult }
    | { type: "ERROR"; payload: ApiError }
    | { type: "RESET" }
    | { type: "UPDATE"; payload: Partial<VideoProcessingState> };

function reducer(
    state: VideoProcessingState,
    action: Action,
): VideoProcessingState {
    switch (action.type) {
        case "START":
            return LOADING_STATE;

        case "PROGRESS": {
            const progressState = action.payload;
            const normalizedStep = normalizeStepName(progressState.step);
            const stepIndex = findStepIndex(normalizedStep);

            const nextStates = [...state.progressStates];
            const normalizedProgress = {
                ...progressState,
                step: normalizedStep,
            };
            const existingIndex = nextStates.findIndex(
                (s) => s.step === normalizedStep,
            );

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
                scrapedVideoInfo:
                    progressState.data?.videoInfo ?? state.scrapedVideoInfo,
                scrapedTranscript:
                    progressState.data?.transcript ?? state.scrapedTranscript,
            };
        }

        case "COMPLETE":
            return {
                ...state,
                scrapedVideoInfo:
                    action.payload.videoInfo || state.scrapedVideoInfo,
                scrapedTranscript:
                    action.payload.transcript || state.scrapedTranscript,
                summaryResult: action.payload,
                currentStage: "Processing completed",
                isLoading: false,
            };

        case "ERROR":
            return { ...state, isLoading: false, error: action.payload };

        case "RESET":
            return INITIAL_STATE;

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

    const cancelCurrentRun = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
    };
    const buildFailedResult = (error: ApiError): StreamingProcessingResult => ({
        success: false,
        totalTime: "0.0s",
        iterations: 0,
        chunksProcessed: 0,
        error,
    });

    const processVideo = async (
        url: string,
        options?: VideoProcessingOptions,
        onProgress?: (state: StreamingProgressState) => void,
    ): Promise<StreamingProcessingResult> => {
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
                (progress) => {
                    if (runToken !== runTokenRef.current) {
                        return;
                    }
                    dispatch({ type: "PROGRESS", payload: progress });
                    onProgress?.(progress);
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
            const error =
                typeof e === "object" && e !== null && "message" in e
                    ? ({
                          message: String((e as Record<string, unknown>).message),
                          type: (e as Record<string, unknown>).type || "processing",
                      } as ApiError)
                    : ({
                          message: "Processing failed",
                          type: "processing",
                      } as ApiError);
            dispatch({ type: "ERROR", payload: error });
            return buildFailedResult(error);
        } finally {
            if (
                runToken === runTokenRef.current &&
                abortControllerRef.current === controller
            ) {
                abortControllerRef.current = null;
            }
        }
    };

    return {
        ...state,
        processVideo,
        cancelCurrentRun,
        updateState: useCallback(
            (updates: Partial<VideoProcessingState>) =>
                dispatch({ type: "UPDATE", payload: updates }),
            [],
        ),
        resetState: useCallback(() => dispatch({ type: "RESET" }), []),
    };
}
