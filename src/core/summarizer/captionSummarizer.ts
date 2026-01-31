/**
 * Summary Workflow using LangChain, LangGraph, and Zod
 * Implements summary generation with quality verification and refinement loop
 */

import { API_ENDPOINTS, DEFAULTS } from "@/core/constants";
import {
  createAgent,
  createMiddleware,
  toolStrategy,
} from "@/core/langgraph-web-shim";
import { getScrapeCreatorsApiKey } from "@/core/runtimeConfig";
import {
  filterContent,
  GarbageIdentificationSchema,
  tagContent,
  untagContent,
} from "@/core/transcript/lineTag";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { createSummarizerLLM } from "./openrouter";
import { PromptBuilder } from "./promptBuilder";
import {
  calculateScore,
  isAcceptable,
  logQuality,
  SUMMARY_CONFIG,
} from "./qualityUtils";
import type { GraphState, SummarizerOutput, Summary } from "./schemas";
import { GraphStateSchema, QualitySchema, SummarySchema } from "./schemas";

// ============================================================================
// Model Client
// ============================================================================

const createOpenRouterLLM = createSummarizerLLM;

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
      const scrapeCreatorsApiKey = await getScrapeCreatorsApiKey();

      if (
        !isYoutubeUrl(transcript_or_url) &&
        (!videoId || youtube_url.includes(videoId))
      ) {
        return transcript_or_url;
      }

      if (!scrapeCreatorsApiKey) {
        return "Error: Scrape Creators API key not configured.";
      }

      try {
        const url = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
        url.searchParams.set("url", youtube_url);
        url.searchParams.set("get_transcript", "true");

        const response = await fetch(url.toString(), {
          headers: {
            "x-api-key": scrapeCreatorsApiKey,
            Accept: "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok)
          return `Error fetching transcript: ${response.status} ${response.statusText}`;

        const data = await response.json();
        const transcript =
          data.transcript_only_text ??
          (Array.isArray(data.transcript)
            ? data.transcript.map((s: any) => s.text).join(" ")
            : "");

        return transcript || "Error: No transcript found for this video.";
      } catch (error) {
        return `Error calling scrap API: ${String(error)}`;
      }
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
// Middleware
// ============================================================================

const GARBAGE_FILTER_PROMPT =
  "Identify and remove garbage sections such as promotional and meaningless content like cliche intros, outros, filler, sponsorships, and other irrelevant segments. The transcript has line tags like [L1], [L2], etc. Return the ranges of tags that should be removed.";

function createGarbageFilterMiddleware(model: string) {
  return createMiddleware({
    name: "garbageFilterMiddleware",
    wrapToolCall: async (request, handler) => {
      if (
        (request.tool?.name ?? request.toolCall.name) !== "scrape_youtube_tool"
      )
        return handler(request);

      const result = await handler(request);
      if (!ToolMessage.isInstance(result) || result.status === "error")
        return result;

      const transcript =
        typeof result.content === "string" ? result.content : "";
      if (!transcript.trim() || transcript.startsWith("Error")) return result;

      try {
        const taggedTranscript = tagContent(transcript);
        const garbage = await (
          await createOpenRouterLLM(model)
        )
          .withStructuredOutput(GarbageIdentificationSchema, {
            method: "jsonMode",
          })
          .invoke([
            ["system", GARBAGE_FILTER_PROMPT],
            ["human", taggedTranscript],
          ]);

        if (garbage.garbage_ranges?.length) {
          result.content = untagContent(
            filterContent(taggedTranscript, garbage.garbage_ranges),
          );
          console.log(
            `Middleware removed ${garbage.garbage_ranges.length} garbage sections.`,
          );
        }
      } catch (error) {
        console.warn(
          "Garbage filter middleware failed, using raw transcript.",
          error,
        );
      }

      return result;
    },
  });
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

    const llm = (await createOpenRouterLLM(summaryModel!)).withStructuredOutput(
      SummarySchema,
    );
    const lang = targetLanguage || "auto";

    let result;
    if (quality && summary) {
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", PromptBuilder.getRefinePrompt(lang, title, description)],
        ["human", "{improvement_prompt}"],
      ]);
      result = await prompt.pipe(llm).invoke({
        improvement_prompt: `Original Transcript:\n${transcript}\n\n# Improve this video summary based on the following feedback:\n\n## Summary:\n\n${JSON.stringify(summary, null, 2)}\n\n## Quality Assessment:\n\n${JSON.stringify(quality, null, 2)}\n\nPlease provide an improved version addressing the issues identified.`,
      });
    } else {
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", PromptBuilder.getSummaryPrompt(lang, title, description)],
        ["human", "{content}"],
      ]);
      result = await prompt.pipe(llm).invoke({ content: transcript });
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

    const quality = await (await createOpenRouterLLM(qualityModel!))
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

async function summarizeFast(
  input: SummarizationInput,
  onProgress?: (message: string) => void,
): Promise<SummarizerOutput> {
  const isUrl = isYoutubeUrl(input.transcript_or_url);
  onProgress?.(
    `Generating summary in Fast Mode (Agent) from ${isUrl ? "URL" : "Transcript"}.`,
  );

  const model = input.summaryModel ?? SUMMARY_CONFIG.MODEL;
  const targetLanguage = input.targetLanguage ?? "auto";
  const agent = createAgent({
    model: await createOpenRouterLLM(model),
    tools: isUrl ? [createScrapeYoutubeTool(input)] : [],
    systemPrompt: PromptBuilder.getSummaryPrompt(
      targetLanguage,
      input.title,
      input.description,
    ),
    responseFormat: toolStrategy(SummarySchema),
    middleware: isUrl
      ? [
          createGarbageFilterMiddleware(
            input.refinerModel ?? DEFAULTS.MODEL_REFINER,
          ),
        ]
      : [],
  });

  const response = await agent.invoke({
    messages: [
      new HumanMessage(
        isUrl
          ? `Summarize the video at: ${input.transcript_or_url}`
          : `Summarize this transcript:\n\n${input.transcript_or_url}`,
      ),
    ],
  });

  if (!response.structuredResponse)
    throw new Error("Agent did not return structured response");

  const summary = response.structuredResponse as Summary;
  onProgress?.("Fast summary completed");

  return {
    summary,
    quality: null,
    iterations: 1,
    qualityScore: 0,
    summaryText: summaryToMarkdown(summary),
  };
}

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

export { PromptBuilder };
