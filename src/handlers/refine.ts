import { MESSAGE_ACTIONS } from "@/core/constants";
import {
	getRefinerWorkloadStats,
	refineTranscriptWithLLM,
} from "@/core/refiner";
import { saveSubtitles, saveVideoMetadata } from "@/core/storage";
import {
	clearTranscriptCache,
	extractVideoInfo,
	fetchTranscript,
	toSubtitleSegments,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import type { VideoWorkloadLifecycle, VideoWorkloadRun } from "./workflow";

export async function handleFetchSubtitles(
	message: ChromeMessage,
	ctx: {
		tabId: number | undefined;
		captionWorkloads: VideoWorkloadLifecycle;
	},
	sendResponse: (response: any) => void,
): Promise<void> {
	const { tabId, captionWorkloads } = ctx;
	const { videoId, requestId, modelSelection, forceRegenerate } =
		message as any;

	const workloadKey = `${videoId}:${String(modelSelection)}:${forceRegenerate === true ? "force" : "normal"}`;
	const run = captionWorkloads.begin({
		videoId,
		requestId,
		workloadKey,
	});

	sendResponse({ status: "processing" });

	const emitCaptionError = (messageText: string) => {
		chrome.runtime
			.sendMessage({
				action: MESSAGE_ACTIONS.SHOW_ERROR,
				error: messageText,
				requestId: run.resolveRequestId(),
				videoId,
			})
			.catch(() => {});
	};

	await run.runOrJoin(
		() =>
			runCaptionJob({
				videoId,
				tabId,
				modelSelection,
				forceRegenerate,
				emitCaptionError,
				run,
			}),
		() => {
			console.log("[refine] dedupe join existing workload", {
				videoId,
				requestId: run.effectiveRequestId,
				workloadKey,
			});
		},
	);
}

/**
 * Runs one caption generation job behind the lifecycle interface.
 */
async function runCaptionJob(input: {
	videoId: string;
	tabId: number | undefined;
	modelSelection: unknown;
	forceRegenerate: unknown;
	emitCaptionError: (messageText: string) => void;
	run: VideoWorkloadRun;
}): Promise<void> {
	const {
		videoId,
		tabId,
		modelSelection,
		forceRegenerate,
		emitCaptionError,
		run,
	} = input;
	const sendSubtitlesToTab = (
		subtitles: unknown[],
		extraPayload: Record<string, unknown> = {},
	) => {
		if (!tabId || !run.isCurrent()) {
			return;
		}
		chrome.tabs
			.sendMessage(tabId, {
				action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
				videoId,
				requestId: run.resolveRequestId(),
				subtitles,
				...extraPayload,
			})
			.catch(() => {});
	};

	try {
		if (forceRegenerate) clearTranscriptCache(videoId);

		const data = await fetchTranscript(videoId, {
			tabId,
		});
		if (data) {
			await saveVideoMetadata(videoId, extractVideoInfo(data, videoId));
		}
		if (!data?.transcript?.length) {
			sendSubtitlesToTab([], { noTranscript: true });
			emitCaptionError("No transcript available for this video.");
			return;
		}

		const segments = toSubtitleSegments(data.transcript);
		const workload = getRefinerWorkloadStats(segments);
		console.log("[refine] transcript workload", {
			videoId,
			requestId: run.effectiveRequestId,
			segmentCount: workload.segmentCount,
			chunkCount: workload.chunkCount,
		});
		if (!run.isCurrent()) return;
		await saveSubtitles(videoId, segments);
		sendSubtitlesToTab(segments, {
			isRawFallback: true,
		});

		console.log("[refine] started", {
			videoId,
			requestId: run.effectiveRequestId,
			chunkCount: workload.chunkCount,
		});
		const refinedSegments = await refineTranscriptWithLLM(
			segments,
			data.title,
			data.description,
			undefined, // onProgress
			String(modelSelection),
			(prioritySegments) => {
				console.log("[refine] partial emitted", {
					videoId,
					requestId: run.effectiveRequestId,
					segmentCount: prioritySegments.length,
				});
				sendSubtitlesToTab(prioritySegments, { isPartial: true });
			},
		);

		if (!run.isCurrent()) return;
		await saveSubtitles(videoId, refinedSegments);
		console.log("[refine] completed", {
			videoId,
			requestId: run.effectiveRequestId,
			segmentCount: refinedSegments.length,
		});
		sendSubtitlesToTab(refinedSegments);
	} catch (error) {
		console.error("Refinement error:", error);
		emitCaptionError(
			error instanceof Error ? error.message : "Caption refinement failed.",
		);
	}
}
