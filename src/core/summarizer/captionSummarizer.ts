/**
 * Summary Workflow using LangChain, LangGraph, and Zod
 * Implements summary generation with quality verification and refinement loop
 */

import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { END, START, StateGraph } from "@langchain/langgraph";
import {
  createAgent,
  createMiddleware,
  toolStrategy,
} from "@/core/langgraph-web-shim";
import { z } from "zod";
import { getScrapeCreatorsApiKey } from "@/core/runtimeConfig";
import { API_ENDPOINTS, DEFAULTS } from "@/core/constants";
import { createSummarizerLLM } from "./openrouter";
import {
  filterContent,
  GarbageIdentificationSchema,
  tagContent,
  untagContent,
} from "@/core/transcript/lineTag";
import { PromptBuilder } from "./promptBuilder";
import {
  calculateScore,
  isAcceptable,
  printQualityBreakdown,
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
 * Functional scrap_youtube_tool factory
 */
function createScrapYoutubeTool(input: SummarizationInput) {
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
      name: "scrap_youtube_tool",
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
        (request.tool?.name ?? request.toolCall.name) !== "scrap_youtube_tool"
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
      summary_model,
      target_language,
      transcript,
      quality,
      summary,
      iteration_count,
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

    const llm = (
      await createOpenRouterLLM(summary_model!)
    ).withStructuredOutput(SummarySchema);
    const targetLang = target_language || "auto";

    let result;
    if (quality && summary) {
      const prompt = ChatPromptTemplate.fromMessages([
        [
          "system",
          PromptBuilder.buildImprovementPrompt(targetLang, title, description),
        ],
        ["human", "{improvement_prompt}"],
      ]);
      result = await prompt.pipe(llm).invoke({
        improvement_prompt: `Original Transcript:\n${transcript}\n\n# Improve this video summary based on the following feedback:\n\n## Summary:\n\n${JSON.stringify(summary, null, 2)}\n\n## Quality Assessment:\n\n${JSON.stringify(quality, null, 2)}\n\nPlease provide an improved version addressing the issues identified.`,
      });
    } else {
      const prompt = ChatPromptTemplate.fromMessages([
        [
          "system",
          PromptBuilder.buildSummaryPrompt(targetLang, title, description),
        ],
        ["human", "{content}"],
      ]);
      result = await prompt.pipe(llm).invoke({ content: transcript });
    }

    progress?.(
      quality && summary ? "Summary refined successfully" : "Summary completed",
    );
    return { summary: result as Summary, iteration_count: iteration_count + 1 };
  };
}

function createQualityNode() {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const { quality_model, summary, iteration_count, onProgress } = state;
    const progress = onProgress as ((msg: string) => void) | undefined;

    progress?.(`Performing quality check using model: ${quality_model}...`);

    const quality = await (await createOpenRouterLLM(quality_model!))
      .withStructuredOutput(QualitySchema, { method: "jsonMode" })
      .invoke([
        ["system", PromptBuilder.buildQualityPrompt()],
        ["human", JSON.stringify(summary, null, 2)],
      ]);

    printQualityBreakdown(quality);
    const score = calculateScore(quality);

    return {
      quality,
      is_complete:
        score >= SUMMARY_CONFIG.MIN_QUALITY_SCORE ||
        iteration_count >= SUMMARY_CONFIG.MAX_ITERATIONS,
    };
  };
}

function shouldContinue(state: GraphState): string {
  if (state.is_complete) return END;

  if (
    state.quality &&
    !isAcceptable(state.quality) &&
    state.iteration_count < SUMMARY_CONFIG.MAX_ITERATIONS
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

function createSummarizationGraph() {
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

function formatSummaryAsMarkdown(summary: Summary): string {
  const parts: string[] = [];
  if (summary.title) parts.push(`# ${summary.title}\n`);
  parts.push("## Summary\n\n", summary.summary, "\n");

  if (summary.takeaways?.length) {
    parts.push("## Key Takeaways\n");
    summary.takeaways.forEach((t) => parts.push(`- ${t}`));
    parts.push("");
  }

  if (summary.chapters?.length) {
    parts.push("## Chapters\n");
    summary.chapters.forEach((c) => {
      parts.push(`### ${c.header}\n\n`, c.summary, "\n");
      c.key_points?.forEach((p) => parts.push(`- ${p}`));
      parts.push("");
    });
  }

  if (summary.keywords?.length) {
    parts.push(
      "## Keywords\n\n",
      summary.keywords.map((kw) => `\`${kw}\``).join("  "),
      "\n",
    );
  }

  return parts.join("\n");
}

export interface SummarizationInput {
  transcript_or_url: string;
  videoId?: string;
  title?: string;
  description?: string;
  summary_model?: string;
  quality_model?: string;
  refiner_model?: string;
  target_language?: string;
  fast_mode?: boolean;
}

const isYoutubeUrl = (input: string) =>
  input.includes("youtube.com/watch") || input.includes("youtu.be/");

async function executeFastSummarization(
  input: SummarizationInput,
  onProgress?: (message: string) => void,
): Promise<SummarizerOutput> {
  const isUrl = isYoutubeUrl(input.transcript_or_url);
  onProgress?.(
    `Generating summary in Fast Mode (Agent) from ${isUrl ? "URL" : "Transcript"}.`,
  );

  const model = input.summary_model ?? SUMMARY_CONFIG.MODEL;
  const targetLang = input.target_language ?? "auto";
  const agent = createAgent({
    model: await createOpenRouterLLM(model),
    tools: isUrl ? [createScrapYoutubeTool(input)] : [],
    systemPrompt: PromptBuilder.buildSummaryPrompt(
      targetLang,
      input.title,
      input.description,
    ),
    responseFormat: toolStrategy(SummarySchema),
    middleware: isUrl
      ? [
          createGarbageFilterMiddleware(
            input.refiner_model ?? DEFAULTS.MODEL_REFINER,
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
    iteration_count: 1,
    quality_score: 0,
    summary_text: formatSummaryAsMarkdown(summary),
  };
}

export async function executeSummarizationWorkflow(
  input: SummarizationInput,
  onProgress?: (message: string) => void,
): Promise<SummarizerOutput> {
  if (input.fast_mode) return executeFastSummarization(input, onProgress);

  let transcript = input.transcript_or_url;
  if (isYoutubeUrl(transcript)) {
    onProgress?.("Resolving URL to transcript for workflow...");
    transcript = await createScrapYoutubeTool(input).invoke({
      youtube_url: transcript,
    });
    if (transcript.startsWith("Error")) throw new Error(transcript);
  }

  const result = await createSummarizationGraph().invoke({
    transcript,
    title: input.title,
    description: input.description,
    summary_model: input.summary_model ?? SUMMARY_CONFIG.MODEL,
    quality_model: input.quality_model ?? SUMMARY_CONFIG.QUALITY_MODEL,
    target_language: input.target_language ?? "auto",
    summary: null,
    quality: null,
    iteration_count: 0,
    is_complete: false,
    onProgress,
  });

  return {
    summary: result.summary!,
    quality: result.quality,
    iteration_count: result.iteration_count,
    quality_score: result.quality ? calculateScore(result.quality) : 0,
    summary_text: formatSummaryAsMarkdown(result.summary!),
  };
}

export { PromptBuilder };
