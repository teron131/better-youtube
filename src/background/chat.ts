/** Handles background chat requests and commits successful artifact edits without overwriting newer summaries. */

import { ChatRequestSchema, type ChatResponse } from "../core/agent/conversation.ts";
import { runAgent } from "../core/agent/runtime.ts";
import { loadConfig } from "../core/config.ts";
import { getSubtitles, getSummary, getVideoMetadata, saveSummary } from "../core/storage.ts";
import { getCachedTranscript } from "../core/transcript/cache.ts";

const pendingVideos = new Set<string>();

/** Rejects overlapping turns for the same video and leaves stored summaries untouched on failure. */
export async function handleVideoChat(message: unknown): Promise<ChatResponse> {
  const request = ChatRequestSchema.parse(message);
  if (pendingVideos.has(request.videoId))
    throw new Error("This video already has an answer in progress.");
  pendingVideos.add(request.videoId);
  try {
    const [config, stored, metadata, subtitles] = await Promise.all([
      loadConfig(),
      getSummary(request.videoId),
      getVideoMetadata(request.videoId),
      getSubtitles(request.videoId),
    ]);
    const cached = getCachedTranscript(request.videoId);
    const transcript =
      cached?.transcript_only_text ||
      cached?.transcript?.map((segment) => segment.text).join("\n") ||
      request.transcript ||
      subtitles?.map((segment) => segment.text).join("\n") ||
      "";
    const model = request.model || config.summarizerModel;
    const result = await runAgent(
      {
        videoId: request.videoId,
        title: metadata?.title || undefined,
        description: metadata?.description || undefined,
        transcript,
        model,
        targetLanguage: config.targetLanguage,
        summary: stored?.summary || null,
        messages: request.messages,
        prompt: request.prompt,
      },
      config,
    );
    if (result.summaryChanged && result.summary) {
      const latest = await getSummary(request.videoId);
      if (latest?.timestamp !== stored?.timestamp)
        throw new Error(
          "The summary changed while the assistant was working. Please retry your edit.",
        );
      await saveSummary(request.videoId, result.summary, `llm::${model}`, config.targetLanguage);
    }
    return { success: true, ...result };
  } finally {
    pendingVideos.delete(request.videoId);
  }
}
