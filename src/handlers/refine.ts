import { MESSAGE_ACTIONS } from "@/core/constants";
import {
	getRefinerWorkloadStats,
	refineTranscriptWithLLM,
} from "@/core/refiner";
import type { RuntimeConfigSnapshot } from "@/core/runtimeConfig";
import { saveSubtitles } from "@/core/storage";
import {
	clearTranscriptCache,
	fetchTranscript,
	toSubtitleSegments,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import {
	cleanupRequestEntry,
	getCurrentRequestId,
	isCurrentWorkload,
	pruneMapEntries,
	runPendingJob,
	setLatestWorkload,
} from "./workflow";

export async function handleFetchSubtitles(
	message: ChromeMessage,
	ctx: {
		tabId: number | undefined;
		captionRequests: Map<string, string>;
		latestCaptionWorkloads: Map<string, string>;
		pendingCaptionJobs: Map<string, Promise<void>>;
		config: RuntimeConfigSnapshot;
	},
	sendResponse: (response: any) => void,
): Promise<void> {
	const {
		tabId,
		captionRequests,
		latestCaptionWorkloads,
		pendingCaptionJobs,
		config,
	} = ctx;
	const { videoId, requestId, modelSelection, forceRegenerate } =
		message as any;

	const workloadKey = `${videoId}:${String(modelSelection)}:${forceRegenerate === true ? "force" : "normal"}`;
	setLatestWorkload(latestCaptionWorkloads, videoId, workloadKey);

	if (requestId) {
		captionRequests.set(videoId, String(requestId));
	}

	sendResponse({ status: "processing" });

	const effectiveRequestId = requestId ? String(requestId) : "";
	const resolveRequestId = () =>
		getCurrentRequestId(captionRequests, videoId, effectiveRequestId);
	const isCurrent = () =>
		isCurrentWorkload(latestCaptionWorkloads, videoId, workloadKey);
	const finalizeRequestState = () => {
		cleanupRequestEntry(captionRequests, videoId, effectiveRequestId);
		pruneMapEntries(captionRequests, 300);
		pruneMapEntries(
			latestCaptionWorkloads,
			300,
			(_videoId, latestWorkload) => !pendingCaptionJobs.has(latestWorkload),
		);
	};

	const emitCaptionError = (messageText: string) => {
		chrome.runtime
			.sendMessage({
				action: MESSAGE_ACTIONS.SHOW_ERROR,
				error: messageText,
				requestId: resolveRequestId(),
				videoId,
			})
			.catch(() => {});
	};

	if (config.transcriptProviderPreference === "chromeTab") {
		try {
			const preflight = await fetchTranscript(videoId, 2, {
				scrapeCreatorsApiKey: config.scrapeCreatorsApiKey,
				supadataApiKey: config.supadataApiKey,
				transcriptProviderPreference: config.transcriptProviderPreference,
				tabId,
			});
			if (!preflight?.transcript?.length) {
				sendResponse({
					status: "error",
					message:
						"Chrome Tab transcript extraction did not produce caption segments.",
				});
				return;
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Chrome Tab transcript extraction failed.";
			console.error("[refine] chromeTab preflight failed", {
				videoId,
				requestId: effectiveRequestId,
				error: errorMessage,
			});
			emitCaptionError(errorMessage);
			sendResponse({
				status: "error",
				message: errorMessage,
			});
			return;
		}
	}

	if (pendingCaptionJobs.has(workloadKey)) {
		console.log("[refine] dedupe join existing workload", {
			videoId,
			requestId: effectiveRequestId,
			workloadKey,
		});
		await pendingCaptionJobs.get(workloadKey);
		finalizeRequestState();
		return;
	}

	const job = (async () => {
		const sendSubtitlesToTab = (
			subtitles: unknown[],
			extraPayload: Record<string, unknown> = {},
		) => {
			if (!tabId || !isCurrent()) {
				return;
			}
			chrome.tabs
				.sendMessage(tabId, {
					action: MESSAGE_ACTIONS.SUBTITLES_GENERATED,
					videoId,
					requestId: resolveRequestId(),
					subtitles,
					...extraPayload,
				})
				.catch(() => {});
		};

		try {
			if (forceRegenerate) clearTranscriptCache(videoId);

			const data = await fetchTranscript(videoId, 2, {
				scrapeCreatorsApiKey: config.scrapeCreatorsApiKey,
				supadataApiKey: config.supadataApiKey,
				transcriptProviderPreference: config.transcriptProviderPreference,
				tabId,
			});
			if (!data?.transcript?.length) {
				sendSubtitlesToTab([], { noTranscript: true });
				emitCaptionError("No transcript available for this video.");
				return;
			}

			const segments = toSubtitleSegments(data.transcript);
			const workload = getRefinerWorkloadStats(segments);
			console.log("[refine] transcript workload", {
				videoId,
				requestId: effectiveRequestId,
				segmentCount: workload.segmentCount,
				chunkCount: workload.chunkCount,
			});
			if (!isCurrent()) return;
			await saveSubtitles(videoId, segments);
			sendSubtitlesToTab(segments, {
				isRawFallback: true,
			});

			console.log("[refine] started", {
				videoId,
				requestId: effectiveRequestId,
				chunkCount: workload.chunkCount,
			});
			const refinedSegments = await refineTranscriptWithLLM(
				segments,
				data.title,
				data.description,
				undefined, // onProgress
				modelSelection,
				(prioritySegments) => {
					console.log("[refine] partial emitted", {
						videoId,
						requestId: effectiveRequestId,
						segmentCount: prioritySegments.length,
					});
					sendSubtitlesToTab(prioritySegments, { isPartial: true });
				},
			);

			if (!isCurrent()) return;
			await saveSubtitles(videoId, refinedSegments);
			console.log("[refine] completed", {
				videoId,
				requestId: effectiveRequestId,
				segmentCount: refinedSegments.length,
			});
			sendSubtitlesToTab(refinedSegments);
		} catch (error) {
			console.error("Refinement error:", error);
			emitCaptionError(
				error instanceof Error ? error.message : "Caption refinement failed.",
			);
		}
	})();

	await runPendingJob(pendingCaptionJobs, workloadKey, job);
	finalizeRequestState();
}
