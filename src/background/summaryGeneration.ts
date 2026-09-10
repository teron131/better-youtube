/** Executes summary providers and fallback; the request handler owns final summary persistence and notifications. */

import { runAgent } from "../core/agent/runtime.ts";
import type { AppConfig } from "../core/config.ts";
import type { VideoMetadata } from "../core/storage.ts";
import type { TranscriptFetchContext } from "../core/transcript/index.ts";
import { resolveTranscriptText } from "../core/transcript/text.ts";
import { createYouTubeWatchUrl } from "../core/utils/url.ts";
import { getTranscriptSource, getVideoInfo } from "../core/videoContext.ts";
import { isGeminiModelSelection } from "../core/workRouter.ts";
import { summarizeGemini } from "./nativeSummary.ts";

export type SummaryResult = {
  summary: string;
  iterations?: number;
};

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
  // Lazy resolution: Gemini can use URL directly; LLM needs transcript_or_url.
  let videoInfoPromise: Promise<VideoMetadata> | undefined;
  let llmSourcePromise: Promise<string> | undefined;
  const getVideoInfoLazy = () => {
    videoInfoPromise ??= getVideoInfo(videoId, transcriptFetchContext);
    return videoInfoPromise;
  };
  const getLlmSourceLazy = () => {
    llmSourcePromise ??= getTranscriptSource(videoId, msgTranscript, transcriptFetchContext);
    return llmSourcePromise;
  };

  const tryGemini = async () => {
    signal?.throwIfAborted();
    if (!isGeminiModelSelection(modelSelection)) {
      throw new Error("Selected model is not a Gemini model; cannot use Gemini provider");
    }
    if (!geminiKey) throw new Error("Gemini API key missing");
    await getVideoInfoLazy();
    const geminiModel = normalizeGeminiModel(String(modelSelection));

    const gemini = msgTranscript
      ? await summarizeGemini(
          {
            kind: "transcript",
            transcript: String(msgTranscript),
            targetLanguage: targetLanguage,
          },
          { model: geminiModel, signal },
          config,
        )
      : await summarizeGemini(
          {
            kind: "youtube_url",
            videoUrl: createYouTubeWatchUrl(videoId),
            targetLanguage: targetLanguage,
          },
          { model: geminiModel, signal },
          config,
        );

    const summary = gemini.summary;
    return {
      summary,
      iterations: 1,
    };
  };

  const tryLlm = async () => {
    signal?.throwIfAborted();
    if (!llmKey) throw new Error("LLM API key missing");
    const transcript = await resolveTranscriptText(
      await getLlmSourceLazy(),
      videoId,
      transcriptFetchContext,
    );
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
    const summary = result.summary;
    return {
      summary,
      iterations: 1,
    };
  };

  let finalProvider = provider;
  let result: SummaryResult;
  try {
    console.log("[summary] trying provider", {
      provider: finalProvider,
      videoId,
      requestId,
    });
    result = await (provider === "gemini" ? tryGemini() : tryLlm());
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
      result = await tryLlm();
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
  const transcript_or_url =
    finalProvider === "gemini" && !msgTranscript
      ? createYouTubeWatchUrl(videoId)
      : await getLlmSourceLazy();
  return { result, videoInfo, source: transcript_or_url, provider: finalProvider };
}

function normalizeGeminiModel(modelSelection: string): string {
  if (modelSelection.startsWith("google/")) return modelSelection.slice("google/".length);
  if (modelSelection.startsWith("gemini-")) return modelSelection;
  throw new Error(`Selected model is not a Gemini model: ${modelSelection}`);
}
