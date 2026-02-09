/**
 * Summary Workflow using LangChain, LangGraph, and Zod
 * Implements summary generation with quality verification and refinement loop
 */

import { createOpenRouterClient } from "@/core/llmClients";
import { tool } from "@langchain/core/tools";
import { END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { fetchTranscript, getTranscriptText } from "@/core/transcript";
import { extractVideoId } from "@/core/utils/url";

import { PromptBuilder } from "./promptBuilder";
import {
  calculateScore,
  isAcceptable,
  logQuality,
  SUMMARY_CONFIG,
} from "./qualityUtils";
import type { GraphState, SummarizerOutput, Summary } from "./schemas";
import {
  GraphStateSchema,
  QualitySchema,
  SummarySchemaNoTimestamps,
} from "./schemas";
import { summarizeFast } from "./fastSummarizer";

// ============================================================================
// Tools
// ============================================================================

/**
 * Functional scrape_youtube_tool factory
 */
function createScrapeYoutubeTool(input: SummarizationInput) {
  return tool(
    async ({ youtube_url }) => {
      const { transcript_or_url, videoId } = input;

      if (
        !isYoutubeUrl(transcript_or_url) &&
        (!videoId || youtube_url.includes(videoId))
      ) {
        return transcript_or_url;
      }

      const resolvedVideoId = videoId ?? extractVideoId(youtube_url);
      if (!resolvedVideoId) return "Error: Could not extract video id.";

      const data = await fetchTranscript(resolvedVideoId);
      if (!data) return "Error: No transcript API keys configured.";

      const transcriptOnlyText =
        typeof (data as any).transcript_only_text === "string"
          ? String((data as any).transcript_only_text)
          : "";
      const transcript =
        transcriptOnlyText || getTranscriptText(data.transcript ?? []);

      return transcript.trim() || "Error: No transcript found for this video.";
    },
    {
      name: "scrape_youtube_tool",
      description: "Scrape a YouTube video and return the transcript.",
      schema: z.object({
        youtube_url: z.string().describe("The YouTube video URL to scrape"),
      }),
    },
  );
}

// ============================================================================
// Graph Nodes
// ============================================================================

function createSummaryNode() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const {
      summaryModel,
      targetLanguage,
      transcript,
      quality,
      summary,
      iterations,
      onProgress,
      title,
      description,
    } = state;
    const progress = onProgress as ((msg: string) => void) | undefined;

    progress?.(
      quality && summary
        ? "Refining summary based on quality feedback..."
        : `Generating initial summary. Transcript length: ${transcript.length} characters`,
    );

    const llm = createOpenRouterClient(
      summaryModel!,
      "Better YouTube - Summarizer",
    ).withStructuredOutput(SummarySchemaNoTimestamps);
    const lang = targetLanguage || "auto";

    let result;
    if (quality && summary) {
      result = await llm.invoke([
        [
          "system",
          PromptBuilder.getOpenRouterRefinePrompt(lang, title, description),
        ],
        [
          "human",
          `Original Transcript:\n${transcript}\n\n# Improve this video summary based on the following feedback:\n\n## Summary:\n\n${JSON.stringify(summary, null, 2)}\n\n## Quality Assessment:\n\n${JSON.stringify(quality, null, 2)}\n\nPlease provide an improved version addressing the issues identified.`,
        ],
      ]);
    } else {
      result = await llm.invoke([
        [
          "system",
          PromptBuilder.getOpenRouterSummaryPrompt(lang, title, description),
        ],
        ["human", transcript],
      ]);
    }

    progress?.(
      quality && summary ? "Summary refined successfully" : "Summary completed",
    );
    return { summary: result as Summary, iterations: iterations + 1 };
  };
}

function createQualityNode() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const { qualityModel, summary, iterations, onProgress } = state;
    const progress = onProgress as ((msg: string) => void) | undefined;

    progress?.(`Performing quality check using model: ${qualityModel}...`);

    const quality = await createOpenRouterClient(
      qualityModel!,
      "Better YouTube - Quality",
    )
      .withStructuredOutput(QualitySchema, { method: "jsonMode" })
      .invoke([
        ["system", PromptBuilder.getQualityPrompt()],
        ["human", JSON.stringify(summary, null, 2)],
      ]);

    logQuality(quality);
    const score = calculateScore(quality);

    return {
      quality,
      isComplete:
        score >= SUMMARY_CONFIG.MIN_QUALITY_SCORE ||
        iterations >= SUMMARY_CONFIG.MAX_ITERATIONS,
    };
  };
}

function shouldContinue(state: GraphState): string {
  if (state.isComplete) return END;

  if (
    state.quality &&
    !isAcceptable(state.quality) &&
    state.iterations < SUMMARY_CONFIG.MAX_ITERATIONS
  ) {
    console.log(
      `Quality ${calculateScore(state.quality)}% below threshold, refining...`,
    );
    return "summaryNode";
  }

  return END;
}

// ============================================================================
// Workflow & Execution
// ============================================================================

function createSummaryGraph() {
  return new StateGraph(GraphStateSchema)
    .addNode("summaryNode", createSummaryNode())
    .addNode("qualityNode", createQualityNode())
    .addEdge(START, "summaryNode")
    .addEdge("summaryNode", "qualityNode")
    .addConditionalEdges("qualityNode", shouldContinue, {
      summaryNode: "summaryNode",
      [END]: END,
    })
    .compile();
}

function summaryToMarkdown(summary: Summary): string {
  const parts: string[] = [];
  if (summary.overview) {
    parts.push("## Summary\n\n", summary.overview, "\n");
  }

  if (summary.chapters && summary.chapters.length > 0) {
    parts.push("## Chapters\n\n");
    summary.chapters.forEach((chapter, index) => {
      parts.push(`### ${index + 1}. ${chapter.title}\n\n`);
      parts.push(chapter.description + "\n\n");
    });
  }

  return parts.join("");
}

export interface SummarizationInput {
  transcript_or_url: string;
  videoId?: string;
  title?: string;
  description?: string;
  summaryModel?: string;
  qualityModel?: string;
  refinerModel?: string;
  targetLanguage?: string;
  fastMode?: boolean;
}

const isYoutubeUrl = (input: string) =>
  input.includes("youtube.com/watch") || input.includes("youtu.be/");

export async function summarizeWorkflow(
  input: SummarizationInput,
  onProgress?: (message: string) => void,
): Promise<SummarizerOutput> {
  if (input.fastMode) return summarizeFast(input, onProgress);

  let transcript = input.transcript_or_url;
  if (isYoutubeUrl(transcript)) {
    onProgress?.("Resolving URL to transcript for workflow...");
    transcript = await createScrapeYoutubeTool(input).invoke({
      youtube_url: transcript,
    });
    if (transcript.startsWith("Error")) throw new Error(transcript);
  }

  const result = await createSummaryGraph().invoke({
    transcript,
    title: input.title,
    description: input.description,
    summaryModel: input.summaryModel ?? SUMMARY_CONFIG.MODEL,
    qualityModel: input.qualityModel ?? SUMMARY_CONFIG.QUALITY_MODEL,
    targetLanguage: input.targetLanguage ?? "auto",
    summary: null,
    quality: null,
    iterations: 0,
    isComplete: false,
    onProgress,
  });

  const summary = result.summary as Summary;

  return {
    summary,
    quality: result.quality,
    iterations: result.iterations,
    qualityScore: result.quality ? calculateScore(result.quality) : 0,
    summaryText: summaryToMarkdown(summary),
  };
}
