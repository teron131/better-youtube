/// <reference types="chrome" />

/**
 * Chrome Extension Messaging Service
 * Handles communication with background script for video processing
 */

import { MESSAGE_ACTIONS, TIMING } from "@/core/constants";
import { createRequestId, type RequestId } from "@/core/requestId";
import type {
	ApiError,
	StreamingProcessingResult,
	StreamingProgressState,
} from "@/core/types";
import {
	type ChromeMessage,
	getCurrentTab,
	sendChromeMessage,
} from "@/core/utils/chrome";
import { extractVideoId } from "@/core/utils/url";
import { getProcessingConfig } from "./configLoaders";

/**
 * Handle scraping step
 */
async function performScrape(
	videoId: string,
	url: string,
	tabId?: number,
	onProgress?: (state: StreamingProgressState) => void,
): Promise<any> {
	onProgress?.({
		step: "scraping",
		stepName: "Fetching Transcript",
		status: "processing",
		message: "Fetching video transcript...",
	});

	const result = await sendChromeMessage({
		action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
		videoId,
		tabId,
	});

	if (result.status !== "success")
		throw new Error("Failed to fetch video data");

	const videoInfo = result.videoInfo;
	onProgress?.({
		step: "scraping",
		stepName: "Fetching Transcript",
		status: "completed",
		message: "Video data fetched",
		data: {
			videoInfo: videoInfo ? normalizeVideoInfo(videoInfo, url) : undefined,
		},
	});
	return videoInfo;
}

/**
 * Normalize video info from various sources
 */
function normalizeVideoInfo(rawInfo: any, fallbackUrl: string): any {
	const vi = rawInfo || {};
	return {
		url: vi.url || fallbackUrl,
		title: vi.title || null,
		thumbnail: vi.thumbnail || null,
		author: vi.author || null,
		duration: vi.duration || null,
		upload_date: vi.upload_date || null,
		view_count: vi.view_count ?? null,
		like_count: vi.like_count ?? null,
	};
}

interface SummaryListenerResult {
	summary: any;
	videoInfo: any;
	transcript: string | null;
	provider?: "gemini" | "llm";
}

interface StreamControl {
	signal?: AbortSignal;
	runId?: string;
}

function createCancellationError(runId?: string): ApiError {
	return {
		message: runId
			? `Processing cancelled (run: ${runId})`
			: "Processing cancelled",
		type: "processing",
	};
}

function isApiError(error: unknown): error is ApiError {
	return typeof error === "object" && error !== null && "message" in error;
}

function toApiError(error: unknown, fallback = "Unknown error"): ApiError {
	if (isApiError(error)) {
		return {
			message: String(error.message || fallback),
			type: error.type || "processing",
		};
	}
	if (error instanceof Error)
		return { message: error.message, type: "processing" };
	return { message: fallback, type: "processing" };
}

function throwIfAborted(signal?: AbortSignal, runId?: string): void {
	if (signal?.aborted) throw createCancellationError(runId);
}

async function withAbort<T>(
	promise: Promise<T>,
	signal?: AbortSignal,
	runId?: string,
): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) throw createCancellationError(runId);

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			reject(createCancellationError(runId));
		};
		signal.addEventListener("abort", onAbort, { once: true });

		promise
			.then((value) => resolve(value))
			.catch((error) => reject(error))
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

/**
 * Create a promise-based listener for summary generation
 */
function createSummaryListener(
	videoId: string,
	requestId: RequestId,
	videoInfo: any,
	onProgress?: (state: StreamingProgressState) => void,
	control?: StreamControl,
): { promise: Promise<SummaryListenerResult>; cancel: () => void } {
	let cleanup = () => {};

	const promise = new Promise<SummaryListenerResult>((resolve, reject) => {
		let settled = false;
		const signal = control?.signal;
		const runId = control?.runId;
		let removeAbortListener = () => {};

		const settle = (handler: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			handler();
		};

		const listener = (msg: ChromeMessage) => {
			if (
				msg.action === MESSAGE_ACTIONS.SUMMARY_GENERATED &&
				msg.videoId === videoId &&
				msg.requestId === requestId
			) {
				const { summary, videoInfo: msgVideoInfo, transcript } = msg;
				const transcriptText =
					typeof transcript === "string" ? transcript : null;
				if (!summary) {
					settle(() =>
						reject({
							message: "No summary data received",
							type: "processing",
						} as ApiError),
					);
					return;
				}

				onProgress?.({
					step: "complete",
					stepName: "Complete",
					status: "completed",
					message: "Summary generated successfully",
				});
				settle(() =>
					resolve({
						summary,
						videoInfo: msgVideoInfo || videoInfo,
						transcript: transcriptText,
						provider: (msg as any).provider,
					}),
				);
				return;
			}

			if (
				msg.action !== MESSAGE_ACTIONS.SHOW_ERROR ||
				(msg as any).requestId !== requestId
			) {
				return;
			}

			settle(() =>
				reject({
					message: (msg as any).error || "Processing failed",
					type: "processing",
				} as ApiError),
			);
		};

		chrome.runtime.onMessage.addListener(listener);

		const timeoutId = setTimeout(() => {
			console.warn("[stream] summary timeout", {
				videoId,
				requestId,
				runId,
			});
			settle(() =>
				reject({
					message: "Processing timeout after 2 minutes",
					type: "processing",
				} as ApiError),
			);
		}, TIMING.PROCESSING_TIMEOUT_MS);

		cleanup = () => {
			chrome.runtime.onMessage.removeListener(listener);
			clearTimeout(timeoutId);
			removeAbortListener();
		};

		if (signal) {
			const onAbort = () => {
				console.log("[stream] summary listener aborted", {
					videoId,
					requestId,
					runId,
				});
				settle(() => reject(createCancellationError(runId)));
			};
			signal.addEventListener("abort", onAbort, { once: true });
			removeAbortListener = () => signal.removeEventListener("abort", onAbort);
			if (signal.aborted) {
				onAbort();
			}
		}
	});

	return {
		promise,
		cancel: () => cleanup?.(),
	};
}

/**
 * Trigger caption refinement
 */
function triggerRefinement(
	videoId: string,
	requestId: RequestId,
	refinerModel: string,
): void {
	void requestCaptionGeneration(
		videoId,
		requestId,
		refinerModel,
		undefined,
	).catch((error) => console.error("Caption refinement error:", error));
}

async function requestCaptionGeneration(
	videoId: string,
	requestId: RequestId,
	refinerModel: string,
	options?: { forceRegenerate?: boolean },
) {
	const activeTab = await getCurrentTab();
	const activeTabId = activeTab?.id;

	return sendChromeMessage({
		action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
		videoId,
		tabId: activeTabId,
		requestId,
		modelSelection: refinerModel,
		forceRegenerate: options?.forceRegenerate,
	});
}

export async function triggerCaptionGeneration(
	url: string,
	options?: { forceRegenerate?: boolean },
): Promise<void> {
	const videoId = extractVideoId(url);
	if (!videoId) throw new Error("Invalid YouTube URL");

	const { refinerModel } = await getProcessingConfig();
	const response = await requestCaptionGeneration(
		videoId,
		createRequestId("caption"),
		refinerModel,
		options,
	);

	if (response?.status === "error") {
		throw new Error(response.message || "Caption generation failed");
	}
}

/**
 * Stream summary: Scrape → Refine (if enabled) + Summarize in parallel
 */
export async function streamSummary(
	url: string,
	options: {
		summaryModel?: string;
		qualityModel?: string;
		targetLanguage?: string | null;
		transcript?: string;
		forceRegenerate?: boolean;
	},
	onProgress?: (state: StreamingProgressState) => void,
	control?: StreamControl,
): Promise<StreamingProcessingResult> {
	const startTime = Date.now();
	const formatTime = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
	const signal = control?.signal;
	const runId = control?.runId;
	const emitProgress = (state: StreamingProgressState) => {
		if (signal?.aborted) return;
		onProgress?.(state);
	};
	if (runId) console.log("[stream] start summary run", { runId, url });

	try {
		throwIfAborted(signal, runId);

		const videoId = extractVideoId(url);
		if (!videoId) throw new Error("Invalid YouTube URL");

		const {
			summarizerModel,
			refinerModel,
			targetLanguage,
			showSubtitles,
			summarizerProvider,
			summarizerMode,
		} = await withAbort(getProcessingConfig(), signal, runId);
		throwIfAborted(signal, runId);
		const activeTab = await withAbort(getCurrentTab(), signal, runId);
		const activeTabId = activeTab?.id;

		let videoInfo: any = null;
		if (!options.transcript) {
			videoInfo = await withAbort(
				performScrape(videoId, url, activeTabId, emitProgress),
				signal,
				runId,
			);
			if (showSubtitles)
				triggerRefinement(videoId, createRequestId("caption"), refinerModel);
		} else {
			emitProgress({
				step: "scraping",
				stepName: "Fetching Transcript",
				status: "completed",
				message: "Using provided transcript",
			});
		}

		throwIfAborted(signal, runId);
		emitProgress({
			step: "summarizing",
			stepName: "Summarizing",
			status: "processing",
			message: "Generating summary...",
		});

		const requestId = createRequestId("summary");
		const { promise: listenerPromise, cancel } = createSummaryListener(
			videoId,
			requestId,
			videoInfo,
			emitProgress,
			control,
		);

		const sendResult = sendChromeMessage({
			action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
			videoId,
			tabId: activeTabId,
			requestId,
			transcript: options.transcript,
			modelSelection: options.summaryModel ?? summarizerModel,
			qualityModel: options.qualityModel,
			refinerModel,
			targetLanguage: options.targetLanguage ?? targetLanguage,
			summarizerProvider,
			summarizerMode,
			forceRegenerate: options.forceRegenerate,
		});

		try {
			const startResponse = await withAbort(sendResult, signal, runId);
			if (startResponse?.status === "error") {
				cancel();
				throw new Error(startResponse.message || "Processing failed");
			}
		} catch (err) {
			cancel();
			if (isApiError(err)) throw err;
			throw new Error(toApiError(err, "Failed to start summarization").message);
		}

		const {
			summary,
			videoInfo: resultVideoInfo,
			transcript,
			provider,
		} = await withAbort(listenerPromise, signal, runId);

		return {
			success: true,
			videoInfo: normalizeVideoInfo(resultVideoInfo, url),
			transcript,
			summary: summary.summary,
			quality: summary.quality,
			summaryText: summary.summaryText,
			qualityScore: summary.qualityScore,
			provider,
			totalTime: formatTime(),
			iterations: summary.iterations || 0,
			chunksProcessed: 0,
		};
	} catch (error) {
		const apiError = toApiError(error);
		emitProgress({
			step: "summarizing",
			stepName: "Processing",
			status: "error",
			message: apiError.message,
			error: apiError,
		});
		return {
			success: false,
			totalTime: formatTime(),
			iterations: 0,
			chunksProcessed: 0,
			error: apiError,
		};
	}
}
