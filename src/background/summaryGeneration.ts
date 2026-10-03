/** Executes summary providers and fallback; the request handler owns final summary persistence and notifications. */

import { runAgent } from "../core/agent/runtime.ts";
import type { AppConfig } from "../core/config.ts";
import type { VideoMetadata } from "../core/storage.ts";
import type { TranscriptFetchContext } from "../core/transcript/index.ts";
import { createYouTubeWatchUrl } from "../core/utils/url.ts";
import { getVideoInfo, resolveTranscriptText } from "../core/videoContext.ts";
import { isGeminiModelSelection } from "../core/workRouter.ts";
import { summarizeGemini } from "./nativeSummary.ts";

/** Resolves each source at most once and falls back to the agent only when native Gemini fails. */
export async function generateSummary(
  input: {
    videoId: string;
    msgTranscript?: string;
    modelSelection: string;
    targetLanguage?: string;
    provider: "gemini" | "llm";
    transcriptFetchContext: TranscriptFetchContext;
    requestId: string;
  },
  config: AppConfig,
  signal?: AbortSignal,
) {
  const {
    videoId,
    msgTranscript,
    modelSelection,
    targetLanguage,
    provider,
    transcriptFetchContext,
    requestId,
  } = input;
  const geminiKey = config.geminiApiKey;
  const llmKey = config.llmApiKey;
  // Lazy resolution: Gemini can summarize the watch URL directly; the agent needs transcript text.
  let videoInfoPromise: Promise<VideoMetadata> | undefined;
  let transcriptPromise: Promise<string> | undefined;
  const getVideoInfoLazy = () => {
    videoInfoPromise ??= getVideoInfo(videoId, transcriptFetchContext);
    return videoInfoPromise;
  };
  const getTranscriptLazy = () => {
    transcriptPromise ??= resolveTranscriptText(videoId, msgTranscript, transcriptFetchContext);
    return transcriptPromise;
  };

  const tryGemini = async () => {
    signal?.throwIfAborted();
    if (!isGeminiModelSelection(modelSelection)) {
      throw new Error("Selected model is not a Gemini model; cannot use Gemini provider");
    }
    if (!geminiKey) throw new Error("Gemini API key missing");
    await getVideoInfoLazy();
    return summarizeGemini(
      msgTranscript
        ? { kind: "transcript", transcript: msgTranscript, targetLanguage }
        : { kind: "youtube_url", videoUrl: createYouTubeWatchUrl(videoId), targetLanguage },
      { model: normalizeGeminiModel(modelSelection), signal },
      config,
    );
  };

  const tryLlm = async () => {
    signal?.throwIfAborted();
    if (!llmKey) throw new Error("LLM API key missing");
    const transcript = await getTranscriptLazy();
    const videoInfo = await getVideoInfoLazy();
    const result = await runAgent(
      {
        videoId,
        title: videoInfo?.title || undefined,
        description: videoInfo?.description || undefined,
        transcript,
        targetLanguage,
        model: modelSelection,
        summary: null,
        messages: [],
        task: "summary",
        prompt: "Summarize this video using the supplied skill. Return the summary as Markdown.",
      },
      config,
      signal,
    );

    if (!result.summary)
      throw new Error("The video assistant finished without creating a summary.");
    return result.summary;
  };

  let finalProvider = provider;
  let summary: string;
  try {
    console.log("[summary] trying provider", {
      provider: finalProvider,
      videoId,
      requestId,
    });
    summary = await (provider === "gemini" ? tryGemini() : tryLlm());
  } catch (error) {
    signal?.throwIfAborted();
    if (provider === "gemini" && llmKey) {
      console.warn("[summary] primary failed, trying fallback", {
        provider,
        fallbackProvider: "llm",
        videoId,
        requestId,
        error: String(error),
      });
      finalProvider = "llm";
      summary = await tryLlm();
    } else {
      console.warn("[summary] primary provider failed", {
        provider,
        videoId,
        requestId,
        error: String(error),
      });
      throw error;
    }
  }

  const videoInfo = await getVideoInfoLazy();
  // Native Gemini summarizes the watch URL itself, so it produces no transcript to report.
  const transcript =
    finalProvider === "gemini" && !msgTranscript ? null : await getTranscriptLazy();
  return { summary, videoInfo, transcript, provider: finalProvider };
}

function normalizeGeminiModel(modelSelection: string): string {
  if (modelSelection.startsWith("google/")) return modelSelection.slice("google/".length);
  if (modelSelection.startsWith("gemini-")) return modelSelection;
  throw new Error(`Selected model is not a Gemini model: ${modelSelection}`);
}
