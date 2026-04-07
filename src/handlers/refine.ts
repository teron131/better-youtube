import { MESSAGE_ACTIONS } from "@/core/constants";
import { refineTranscriptWithLLM } from "@/core/refiner";
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
            (_videoId, latestWorkload) =>
                !pendingCaptionJobs.has(latestWorkload),
        );
    };

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
                transcriptProviderPreference:
                    config.transcriptProviderPreference,
            });
            if (!data?.transcript?.length) {
                sendSubtitlesToTab([], { noTranscript: true });
                return;
            }

            const segments = toSubtitleSegments(data.transcript);

            const refinedSegments = await refineTranscriptWithLLM(
                segments,
                data.title,
                data.description,
                undefined, // onProgress
                modelSelection,
                (prioritySegments) => {
                    sendSubtitlesToTab(prioritySegments, { isPartial: true });
                },
            );

            if (!isCurrent()) return;
            await saveSubtitles(videoId, refinedSegments);
            sendSubtitlesToTab(refinedSegments);
        } catch (error) {
            console.error("Refinement error:", error);
        }
    })();

    await runPendingJob(pendingCaptionJobs, workloadKey, job);
    finalizeRequestState();
}
