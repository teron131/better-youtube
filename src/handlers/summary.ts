/**
 * Summary Handler
 * Handles summary generation requests with caching and workflow orchestration
 */

import { MESSAGE_ACTIONS } from "@/core/constants";
import type { RuntimeConfigSnapshot } from "@/core/runtimeConfig";
import {
    getSubtitles,
    getSummary,
    getVideoMetadata,
    type StoredSummary,
    saveSummary,
    saveVideoMetadata,
    type VideoMetadata,
} from "@/core/storage";
import {
    parseOpenRouterSummary,
    type Summary,
    summarizeGemini,
    summarizeWorkflow,
    summaryToMarkdown,
} from "@/core/summarizer";
import {
    clearTranscriptFetchContext,
    extractVideoInfo,
    fetchTranscript,
    getCachedTranscript,
    getPendingTranscript,
    getTranscriptText,
    setTranscriptFetchContext,
    type TranscriptFetchContext,
} from "@/core/transcript";
import type { ChromeMessage } from "@/core/utils/chrome";
import { createYouTubeWatchUrl } from "@/core/utils/url";
import {
    isGeminiModelSelection,
    resolveSummarizationRoute,
} from "@/core/workRouter";
import {
    cleanupRequestEntry,
    getCurrentRequestId,
    isCurrentWorkload,
    pruneMapEntries,
    runPendingJob,
    setLatestWorkload,
} from "./workflow";

// ============================================================================
// Types
// ============================================================================

type SummaryResult = {
    summary: Summary;
    quality?: any;
    summaryText?: string;
    iterations?: number;
    qualityScore?: number;
};

type SummaryProvider = "openrouter" | "gemini" | "auto";
type SummarizerMode = "native" | "validation" | "fast";

type ProviderPref = "auto" | "gemini" | "openrouter";

function normalizeProviderPreference(input: {
    summaryProvider?: unknown;
    summarizerProvider?: unknown;
    globalProvider: ProviderPref;
}): ProviderPref {
    const { summaryProvider, summarizerProvider, globalProvider } = input;

    if (
        summarizerProvider === "gemini" ||
        summarizerProvider === "openrouter"
    ) {
        return summarizerProvider;
    }

    if (summaryProvider === "gemini") return "gemini";
    if (summaryProvider === "openrouter") return "openrouter";
    if (summaryProvider === "auto") return "auto";

    return globalProvider;
}

function normalizeModePreference(input: {
    summarizerMode?: unknown;
    globalMode: SummarizerMode;
}): SummarizerMode {
    const { summarizerMode, globalMode } = input;

    if (
        summarizerMode === "native" ||
        summarizerMode === "validation" ||
        summarizerMode === "fast"
    ) {
        return summarizerMode;
    }

    return globalMode;
}

function logSummaryConfig(payload: {
    videoId: string;
    requestId: string;
    modelSelection: string;
    targetLanguage: string;
    providerPref: ProviderPref;
    modePref: SummarizerMode;
    transcriptProviderPreference: string;
    resolvedProvider: string;
    desiredOpenRouterMode: "react" | "fast";
    msgHasTranscript: boolean;
    hasKeys: {
        gemini: boolean;
        openrouter: boolean;
        scrapeCreators: boolean;
        supadata: boolean;
    };
}) {
    console.log(
        "[summary] config",
        JSON.stringify(
            {
                videoId: payload.videoId,
                requestId: payload.requestId,
                modelSelection: payload.modelSelection,
                targetLanguage: payload.targetLanguage,
                providerPref: payload.providerPref,
                modePref: payload.modePref,
                transcriptProviderPreference:
                    payload.transcriptProviderPreference,
                desiredOpenRouterMode: payload.desiredOpenRouterMode,
                resolvedProvider: payload.resolvedProvider,
                msgHasTranscript: payload.msgHasTranscript,
                hasKeys: payload.hasKeys,
            },
            null,
            0,
        ),
    );
}

// ============================================================================
// Storage Resolution Helpers
// ============================================================================

/**
 * Check if cached summary exists and is still valid for the current request
 */
async function checkCachedSummary(
    videoId: string,
    modelUsed: string,
    targetLanguage: string,
    forceRegenerate: boolean,
): Promise<StoredSummary | null> {
    if (forceRegenerate) return null;
    const storedSummary = await getSummary(videoId);
    if (!storedSummary) return null;
    if (storedSummary.modelUsed !== modelUsed) return null;
    if (storedSummary.targetLanguage !== targetLanguage) return null;
    return storedSummary;
}

/**
 * Resolve transcript source (message → cache → stored → URL)
 */
async function getTranscriptSource(
    videoId: string,
    messageTranscript: string | undefined,
    fetchContext: TranscriptFetchContext,
): Promise<string> {
    if (messageTranscript) {
        console.log(`Using provided transcript for summary of ${videoId}`);
        return messageTranscript;
    }

    const pending = getPendingTranscript(videoId);
    if (pending) {
        console.log(`Waiting for pending transcript fetch for ${videoId}`);
        const fetched = await pending;
        const pendingText = toTranscriptText(fetched);
        if (pendingText) {
            return pendingText;
        }
    }

    const cached = getCachedTranscript(videoId);
    if (cached?.transcript_only_text) {
        console.log(`Using cached transcript for summary of ${videoId}`);
        return cached.transcript_only_text;
    }
    if (cached?.transcript?.length) {
        console.log(
            `Using cached transcript segments for summary of ${videoId}`,
        );
        return segmentsToText(cached.transcript);
    }

    const storedSubtitles = await getSubtitles(videoId);
    if (storedSubtitles?.length) {
        console.log(`Using stored subtitles for summary of ${videoId}`);
        return segmentsToText(storedSubtitles);
    }

    const fetched = await fetchTranscript(videoId, 2, fetchContext);
    const text = toTranscriptText(fetched);
    if (text) {
        console.log(`Using fetched transcript for summary of ${videoId}`);
        return text;
    }

    console.log(`No transcript text available for ${videoId}, will use URL.`);
    return createYouTubeWatchUrl(videoId);
}

/**
 * Resolve video info (stored → cache → fetch)
 */
async function getVideoInfo(
    videoId: string,
    fetchContext: TranscriptFetchContext,
): Promise<VideoMetadata> {
    const stored = await getVideoMetadata(videoId);
    if (stored) {
        console.log(`Using stored video info for ${videoId}`);
        return stored;
    }

    const cached = getCachedTranscript(videoId);
    if (cached) {
        const videoInfo = extractVideoInfo(cached, videoId);
        console.log(`Using cached video info for ${videoId}`);
        return videoInfo;
    }

    console.log(`No stored/cached video info for ${videoId}, fetching...`);
    const data = await fetchTranscript(videoId, 2, fetchContext);
    if (data) {
        const videoInfo = extractVideoInfo(data, videoId);
        await saveVideoMetadata(videoId, videoInfo);
        return videoInfo;
    }

    return {
        url: createYouTubeWatchUrl(videoId),
        title: null,
        thumbnail: null,
        author: null,
        duration: null,
        uploadDate: null,
        viewCount: null,
        likeCount: null,
    };
}

function toTranscriptText(data: any): string | null {
    if (!data) return null;
    const transcriptOnlyText =
        typeof data.transcript_only_text === "string"
            ? String(data.transcript_only_text)
            : "";
    const text = transcriptOnlyText || getTranscriptText(data.transcript ?? []);
    return text.trim() ? text : null;
}

// ============================================================================
// Broadcasting Helpers
// ============================================================================

/**
 * Broadcast stored summary result to sidepanel
 */
async function broadcastStoredSummary(
    videoId: string,
    storedSummary: StoredSummary,
    requestId?: string,
): Promise<void> {
    const videoInfo = await getVideoMetadata(videoId);

    const summary = storedSummary.summary as any;
    const summaryText = videoInfo ? summaryToMarkdown(summary, videoInfo) : "";

    const provider = storedSummary.modelUsed?.startsWith("gemini::")
        ? "gemini"
        : storedSummary.modelUsed?.startsWith("openrouter::")
          ? "openrouter"
          : undefined;

    sendRuntimeMessage({
        action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
        videoId,
        requestId,
        summary: {
            summary,
            quality: storedSummary.quality ?? null,
            summaryText: summaryText,
            iterations: 0,
            qualityScore: 0,
        },
        provider,
        videoInfo,
        transcript: null,
    });

    console.log(`Returned stored summary for video: ${videoId}`);
}

/**
 * Broadcast summary result to sidepanel and save to storage
 */
async function broadcastSummaryResult(
    videoId: string,
    result: SummaryResult,
    videoInfo: VideoMetadata,
    transcript_or_url: string,
    modelSelection: string,
    targetLanguage: string,
    provider: "openrouter" | "gemini",
    requestId?: string,
): Promise<void> {
    // Save summary to storage
    await saveSummary(
        videoId,
        result.summary,
        modelSelection,
        targetLanguage,
        result.quality,
    );

    // Send result to sidepanel
    sendRuntimeMessage({
        action: MESSAGE_ACTIONS.SUMMARY_GENERATED,
        videoId,
        requestId,
        summary: result,
        provider,
        videoInfo,
        transcript: transcript_or_url.startsWith("http")
            ? null
            : transcript_or_url,
    });

    console.log(`Summarization workflow completed for video: ${videoId}`);
}

// ============================================================================
// Utility Helpers
// ============================================================================

function segmentsToText(segments: Array<{ text: string }>): string {
    return segments.map((segment) => segment.text).join(" ");
}

function sendRuntimeMessage(payload: Record<string, unknown>): void {
    chrome.runtime.sendMessage(payload, () => {
        if (chrome.runtime.lastError) {
            // Ignore when no listeners exist.
        }
    });
}

function hashString(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
}

function buildSummaryWorkloadKey(input: {
    videoId: string;
    providerPref: ProviderPref;
    modePref: SummarizerMode;
    modelSelection: unknown;
    targetLanguage: unknown;
    qualityModel: unknown;
    refinerModel: unknown;
    forceRegenerate: unknown;
    transcript: unknown;
}): string {
    const providerForKey = `${input.providerPref}:${input.modePref}`;
    const transcriptFingerprint =
        typeof input.transcript === "string"
            ? hashString(input.transcript)
            : "none";
    const qualityModelKey = String(
        input.qualityModel || input.modelSelection || "",
    );
    const refinerModelKey = String(input.refinerModel || "");

    return (
        `${input.videoId}:${providerForKey}:${String(input.modelSelection)}:${String(input.targetLanguage)}:` +
        `${qualityModelKey}:${refinerModelKey}:${input.forceRegenerate === true ? "force" : "normal"}:${transcriptFingerprint}`
    );
}

// ============================================================================
// Main Handler
// ============================================================================

export async function handleGenerateSummary(
    message: ChromeMessage,
    ctx: {
        summaryRequests: Map<string, string>;
        latestSummaryWorkloads: Map<string, string>;
        pendingSummaryJobs: Map<string, Promise<void>>;
        config: RuntimeConfigSnapshot;
    },
    sendResponse: (response: any) => void,
): Promise<void> {
    const {
        summaryRequests,
        latestSummaryWorkloads,
        pendingSummaryJobs,
        config,
    } = ctx;
    const {
        videoId,
        requestId,
        transcript: msgTranscript,
        modelSelection,
        qualityModel,
        refinerModel,
        targetLanguage,
        forceRegenerate,
        summaryProvider,
        summarizerMode,
        summarizerProvider,
    } = message as any;
    const transcriptFetchContext: TranscriptFetchContext = {
        scrapeCreatorsApiKey: config.scrapeCreatorsApiKey,
        supadataApiKey: config.supadataApiKey,
        transcriptProviderPreference: config.transcriptProviderPreference,
    };

    if (requestId) {
        summaryRequests.set(videoId, String(requestId));
    }

    sendResponse({ status: "processing" });

    const effectiveRequestId = requestId ? String(requestId) : "";
    const providerPref = normalizeProviderPreference({
        summarizerProvider,
        summaryProvider,
        globalProvider: config.summarizerProvider,
    });

    const modePref = normalizeModePreference({
        summarizerMode,
        globalMode: config.summarizerMode,
    });

    const desiredOpenRouterMode = modePref === "fast" ? "fast" : "react";

    const workloadKey = buildSummaryWorkloadKey({
        videoId,
        providerPref,
        modePref,
        modelSelection,
        targetLanguage,
        qualityModel,
        refinerModel,
        forceRegenerate,
        transcript: msgTranscript,
    });
    setLatestWorkload(latestSummaryWorkloads, videoId, workloadKey);

    const isCurrent = () =>
        isCurrentWorkload(latestSummaryWorkloads, videoId, workloadKey);
    const resolveRequestId = () =>
        getCurrentRequestId(summaryRequests, videoId, effectiveRequestId);
    const transcriptContextOwnerId = `${workloadKey}:${effectiveRequestId}`;
    const finalizeRequestState = () => {
        cleanupRequestEntry(summaryRequests, videoId, effectiveRequestId);
        pruneMapEntries(summaryRequests, 300);
        pruneMapEntries(
            latestSummaryWorkloads,
            300,
            (_videoId, latestWorkload) =>
                !pendingSummaryJobs.has(latestWorkload),
        );
    };

    if (pendingSummaryJobs.has(workloadKey)) {
        console.log("[summary] dedupe join existing workload", {
            videoId,
            requestId: effectiveRequestId,
            workloadKey,
        });
        await pendingSummaryJobs.get(workloadKey);
        finalizeRequestState();
        return;
    }

    const job = (async () => {
        setTranscriptFetchContext(
            videoId,
            transcriptContextOwnerId,
            transcriptFetchContext,
        );
        try {
            const geminiKey = config.geminiApiKey;
            const openRouterKey = config.openRouterApiKey;

            const { provider } = resolveSummarizationRoute({
                requestedProvider: providerPref,
                requestedMode: modePref,
                summarizerModel: String(modelSelection),
                hasGeminiKey: !!geminiKey,
                hasOpenRouterKey: !!openRouterKey,
            });

            logSummaryConfig({
                videoId,
                requestId: effectiveRequestId,
                modelSelection: String(modelSelection),
                targetLanguage: String(targetLanguage),
                providerPref,
                modePref,
                transcriptProviderPreference: String(
                    config.transcriptProviderPreference,
                ),
                resolvedProvider: provider,
                desiredOpenRouterMode,
                msgHasTranscript: Boolean(msgTranscript),
                hasKeys: {
                    gemini: Boolean(geminiKey),
                    openrouter: Boolean(openRouterKey),
                    scrapeCreators: Boolean(config.scrapeCreatorsApiKey),
                    supadata: Boolean(config.supadataApiKey),
                },
            });

            const modelUsedKey = `${provider}::${String(modelSelection)}`;

            const storedSummary = await checkCachedSummary(
                videoId,
                modelUsedKey,
                targetLanguage,
                forceRegenerate,
            );
            if (storedSummary) {
                if (!isCurrent()) return;
                await broadcastStoredSummary(
                    videoId,
                    storedSummary,
                    resolveRequestId(),
                );
                return;
            }

            // Lazy resolution: Gemini can use URL directly; OpenRouter needs transcript_or_url.
            const getVideoInfoLazy = async () =>
                getVideoInfo(videoId, transcriptFetchContext);
            const getOpenRouterSourceLazy = async () =>
                getTranscriptSource(
                    videoId,
                    msgTranscript,
                    transcriptFetchContext,
                );

            type ConcreteProvider = "gemini" | "openrouter";

            const tryGemini = async () => {
                if (!geminiKey) throw new Error("Gemini API key missing");
                const videoInfo = await getVideoInfoLazy();
                const geminiModel = normalizeGeminiModel(
                    String(modelSelection),
                );

                const gemini = msgTranscript
                    ? await summarizeGemini(
                          {
                              kind: "transcript",
                              transcript: String(msgTranscript),
                              targetLanguage: targetLanguage,
                          },
                          { model: geminiModel },
                      )
                    : await summarizeGemini(
                          {
                              kind: "youtube_url",
                              videoUrl: createYouTubeWatchUrl(videoId),
                              targetLanguage: targetLanguage,
                          },
                          { model: geminiModel },
                      );

                const summary = gemini.summary;
                return {
                    summary,
                    quality: null,
                    iterations: 1,
                    qualityScore: 0,
                    summaryText: summaryToMarkdown(summary, videoInfo),
                };
            };

            const tryOpenRouter = async () => {
                if (!openRouterKey)
                    throw new Error("OpenRouter API key missing");
                const transcript_or_url = await getOpenRouterSourceLazy();
                const videoInfo = await getVideoInfoLazy();
                const workflow = await summarizeWorkflow({
                    transcript_or_url,
                    videoId,
                    title: videoInfo?.title || undefined,
                    description: videoInfo?.description || undefined,
                    summaryModel: modelSelection,
                    qualityModel: qualityModel || modelSelection,
                    refinerModel: refinerModel,
                    targetLanguage: targetLanguage,
                    fastMode: desiredOpenRouterMode === "fast",
                });

                const summary = parseOpenRouterSummary(workflow.summary);
                return {
                    summary,
                    quality: workflow.quality,
                    iterations: workflow.iterations,
                    qualityScore: workflow.qualityScore,
                    summaryText: summaryToMarkdown(summary, videoInfo),
                };
            };

            const providerRunners: Record<
                ConcreteProvider,
                () => Promise<SummaryResult>
            > = {
                gemini: tryGemini,
                openrouter: tryOpenRouter,
            };

            const runProvider = async (selectedProvider: ConcreteProvider) => {
                if (
                    selectedProvider === "gemini" &&
                    modePref !== "native" &&
                    !isGeminiModelSelection(String(modelSelection))
                ) {
                    throw new Error(
                        "Selected model is not a Gemini model; cannot use Gemini provider",
                    );
                }
                return providerRunners[selectedProvider]();
            };

            let finalProvider = provider as ConcreteProvider;
            let result: SummaryResult;
            try {
                result = await runProvider(finalProvider);
            } catch (error) {
                console.warn("[summary] primary failed, trying fallback", {
                    provider,
                    videoId,
                    requestId: effectiveRequestId,
                    error: String(error),
                });
                if (provider === "gemini" && openRouterKey) {
                    finalProvider = "openrouter";
                    result = await runProvider(finalProvider);
                } else if (provider === "openrouter" && geminiKey) {
                    finalProvider = "gemini";
                    result = await runProvider(finalProvider);
                } else {
                    throw error;
                }
            }

            if (!isCurrent()) return;

            const videoInfo = await getVideoInfoLazy();
            const transcript_or_url =
                finalProvider === "gemini" && !msgTranscript
                    ? createYouTubeWatchUrl(videoId)
                    : await getOpenRouterSourceLazy();
            await broadcastSummaryResult(
                videoId,
                result,
                videoInfo,
                transcript_or_url,
                `${finalProvider}::${String(modelSelection)}`,
                targetLanguage,
                finalProvider,
                resolveRequestId(),
            );
        } catch (error) {
            if (!isCurrent()) return;
            console.error("Summary error:", error);
            chrome.runtime
                .sendMessage({
                    action: MESSAGE_ACTIONS.SHOW_ERROR,
                    error: String(error),
                    requestId: resolveRequestId(),
                    videoId,
                })
                .catch(() => {});
        } finally {
            clearTranscriptFetchContext(videoId, transcriptContextOwnerId);
        }
    })();

    await runPendingJob(pendingSummaryJobs, workloadKey, job);
    finalizeRequestState();
}

function normalizeGeminiModel(modelSelection: string): string {
    if (modelSelection.startsWith("google/"))
        return modelSelection.slice("google/".length);
    if (modelSelection.startsWith("gemini-")) return modelSelection;
    return "gemini-3-flash-preview";
}
