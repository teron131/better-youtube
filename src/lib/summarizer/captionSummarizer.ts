/**
 * Summary Workflow using LangChain, LangGraph, and Zod
 * Implements analysis generation with quality verification and refinement loop
 */

import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, createMiddleware, toolStrategy } from "langchain";
import { z } from "zod";
import { API_ENDPOINTS, DEFAULTS } from "../constants";
import {
  filterContent,
  GarbageIdentificationSchema,
  tagContent,
  untagContent,
} from "../lineTag";
import { PromptBuilder } from "./promptBuilder";
import { ANALYSIS_CONFIG, calculateScore, isAcceptable, printQualityBreakdown } from "./qualityUtils";
import type { Analysis, GraphState, SummarizerOutput } from "./schemas";
import { AnalysisSchema, GraphStateSchema, QualitySchema } from "./schemas";

// ============================================================================
// Model Client
// ============================================================================

/**
 * Create OpenRouter LLM instance using LangChain
 */
function createOpenRouterLLM(model: string, apiKey: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: {
      baseURL: API_ENDPOINTS.OPENROUTER_BASE,
      defaultHeaders: {
        "HTTP-Referer": chrome.runtime.getURL(""),
        "X-Title": "Better YouTube",
      },
    },
    temperature: 0.0,
  });
}

// ============================================================================
// Tools
// ============================================================================

/**
 * Functional scrap_youtube_tool factory
 */
function createScrapYoutubeTool(input: SummarizationInput) {
  return tool(
    async ({ youtube_url }) => {
      const { transcript_or_url, videoId, scrapeCreatorsApiKey } = input;
      
      if (!isYoutubeUrl(transcript_or_url) && (!videoId || youtube_url.includes(videoId))) {
        return transcript_or_url;
      }

      if (!scrapeCreatorsApiKey) {
        return "Error: Scrape Creators API key not provided to the tool.";
      }

      try {
        const url = new URL(API_ENDPOINTS.SCRAPE_CREATORS);
        url.searchParams.set("url", youtube_url);
        url.searchParams.set("get_transcript", "true");

        const response = await fetch(url.toString(), {
          headers: { "x-api-key": scrapeCreatorsApiKey, Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) return `Error fetching transcript: ${response.status} ${response.statusText}`;

        const data = await response.json();
        const transcript = data.transcript_only_text ?? 
          (Array.isArray(data.transcript) ? data.transcript.map((s: any) => s.text).join(" ") : "");
        
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
    }
  );
}

// ============================================================================
// Middleware
// ============================================================================

const GARBAGE_FILTER_PROMPT = "Identify and remove garbage sections such as promotional and meaningless content like cliche intros, outros, filler, sponsorships, and other irrelevant segments. The transcript has line tags like [L1], [L2], etc. Return the ranges of tags that should be removed.";

function createGarbageFilterMiddleware(apiKey: string, model: string) {
  return createMiddleware({
    name: "garbageFilterMiddleware",
    wrapToolCall: async (request, handler) => {
      if ((request.tool?.name ?? request.toolCall.name) !== "scrap_youtube_tool") return handler(request);

      const result = await handler(request);
      if (!ToolMessage.isInstance(result) || result.status === "error") return result;

      const transcript = typeof result.content === "string" ? result.content : "";
      if (!transcript.trim() || transcript.startsWith("Error")) return result;

      try {
        const taggedTranscript = tagContent(transcript);
        const garbage = await createOpenRouterLLM(model, apiKey)
          .withStructuredOutput(GarbageIdentificationSchema, { method: "jsonMode" })
          .invoke([
            ["system", GARBAGE_FILTER_PROMPT],
            ["human", taggedTranscript],
          ]);

        if (garbage.garbage_ranges?.length) {
          result.content = untagContent(filterContent(taggedTranscript, garbage.garbage_ranges));
          console.log(`🧹 Middleware removed ${garbage.garbage_ranges.length} garbage sections.`);
        }
      } catch (error) {
        console.warn("Garbage filter middleware failed, using raw transcript.", error);
      }

      return result;
    },
  });
}

// ============================================================================
// Graph Nodes
// ============================================================================

async function analysisNode(state: GraphState): Promise<Partial<GraphState>> {
  const { apiKey, analysis_model, target_language, transcript, quality, analysis, iteration_count, progressCallback } = state;
  const progress = progressCallback as ((msg: string) => void) | undefined;
  
  progress?.(quality && analysis ? "Refining analysis based on quality feedback..." : `Generating initial analysis. Transcript length: ${transcript.length} characters`);

  const llm = createOpenRouterLLM(analysis_model!, apiKey!).withStructuredOutput(AnalysisSchema);
  const targetLang = target_language || "auto";

  let result;
  if (quality && analysis) {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", PromptBuilder.buildImprovementPrompt(targetLang)],
      ["human", "{improvement_prompt}"],
    ]);
    result = await prompt.pipe(llm).invoke({
      improvement_prompt: `Original Transcript:\n${transcript}\n\n# Improve this video analysis based on the following feedback:\n\n## Analysis:\n\n${JSON.stringify(analysis, null, 2)}\n\n## Quality Assessment:\n\n${JSON.stringify(quality, null, 2)}\n\nPlease provide an improved version addressing the issues identified.`,
    });
  } else {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", PromptBuilder.buildAnalysisPrompt(targetLang)],
      ["human", "{content}"],
    ]);
    result = await prompt.pipe(llm).invoke({ content: transcript });
  }

  progress?.(quality && analysis ? "Analysis refined successfully" : "Analysis completed");
  return { analysis: result as Analysis, iteration_count: iteration_count + 1 };
}

async function qualityNode(state: GraphState): Promise<Partial<GraphState>> {
  const { apiKey, quality_model, analysis, iteration_count, progressCallback } = state;
  const progress = progressCallback as ((msg: string) => void) | undefined;
  
  progress?.(`Performing quality check using model: ${quality_model}...`);

  const quality = await createOpenRouterLLM(quality_model!, apiKey!)
    .withStructuredOutput(QualitySchema, { method: "jsonMode" })
    .invoke([
      ["system", PromptBuilder.buildQualityPrompt()],
      ["human", JSON.stringify(analysis, null, 2)],
    ]);

  printQualityBreakdown(quality);
  const score = calculateScore(quality);
  
  return {
    quality,
    is_complete: score >= ANALYSIS_CONFIG.MIN_QUALITY_SCORE || iteration_count >= ANALYSIS_CONFIG.MAX_ITERATIONS,
  };
}

function shouldContinue(state: GraphState): string {
  if (state.is_complete) return END;
  
  if (state.quality && !isAcceptable(state.quality) && state.iteration_count < ANALYSIS_CONFIG.MAX_ITERATIONS) {
    console.log(`Quality ${calculateScore(state.quality)}% below threshold, refining...`);
    return "analysisNode";
  }

  return END;
}

// ============================================================================
// Workflow & Execution
// ============================================================================

function createSummarizationGraph() {
  return new StateGraph(GraphStateSchema)
    .addNode("analysisNode", analysisNode)
    .addNode("qualityNode", qualityNode)
    .addEdge(START, "analysisNode")
    .addEdge("analysisNode", "qualityNode")
    .addConditionalEdges("qualityNode", shouldContinue, {
      analysisNode: "analysisNode",
      [END]: END,
    })
    .compile();
}

function formatAnalysisAsMarkdown(analysis: Analysis): string {
  const parts: string[] = [];
  if (analysis.title) parts.push(`# ${analysis.title}\n`);
  parts.push("## Summary\n\n", analysis.summary, "\n");

  if (analysis.takeaways?.length) {
    parts.push("## Key Takeaways\n");
    analysis.takeaways.forEach(t => parts.push(`- ${t}`));
    parts.push("");
  }

  if (analysis.chapters?.length) {
    parts.push("## Chapters\n");
    analysis.chapters.forEach(c => {
      parts.push(`### ${c.header}\n\n`, c.summary, "\n");
      c.key_points?.forEach(p => parts.push(`- ${p}`));
      parts.push("");
    });
  }

  if (analysis.keywords?.length) {
    parts.push("## Keywords\n\n", analysis.keywords.map(kw => `\`${kw}\``).join("  "), "\n");
  }

  return parts.join("\n");
}

export interface SummarizationInput {
  transcript_or_url: string;
  videoId?: string;
  scrapeCreatorsApiKey?: string;
  analysis_model?: string;
  quality_model?: string;
  refiner_model?: string;
  target_language?: string;
  fast_mode?: boolean;
}

const isYoutubeUrl = (input: string) => input.includes("youtube.com/watch") || input.includes("youtu.be/");

async function executeFastSummarization(
  input: SummarizationInput,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<SummarizerOutput> {
  const isUrl = isYoutubeUrl(input.transcript_or_url);
  progressCallback?.(`Generating analysis in Fast Mode (Agent) from ${isUrl ? "URL" : "Transcript"}.`);

  const model = input.analysis_model ?? ANALYSIS_CONFIG.MODEL;
  const targetLang = input.target_language ?? "auto";
  const agent = createAgent({
    model: createOpenRouterLLM(model, apiKey),
    tools: isUrl ? [createScrapYoutubeTool(input)] : [],
    systemPrompt: PromptBuilder.buildAnalysisPrompt(targetLang),
    responseFormat: toolStrategy(AnalysisSchema),
    middleware: isUrl ? [createGarbageFilterMiddleware(apiKey, input.refiner_model ?? DEFAULTS.MODEL_REFINER)] : [],
  });

  const response = await agent.invoke({
    messages: [new HumanMessage(isUrl ? `Analyze the video at: ${input.transcript_or_url}` : `Analyze this transcript:\n\n${input.transcript_or_url}`)],
  });

  if (!response.structuredResponse) throw new Error("Agent did not return structured response");
  
  const analysis = response.structuredResponse as Analysis;
  progressCallback?.("Fast analysis completed");

  return {
    analysis,
    quality: null,
    iteration_count: 1,
    quality_score: 0,
    summary_text: formatAnalysisAsMarkdown(analysis),
  };
}

export async function executeSummarizationWorkflow(
  input: SummarizationInput,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<SummarizerOutput> {
  if (input.fast_mode) return executeFastSummarization(input, apiKey, progressCallback);

  let transcript = input.transcript_or_url;
  if (isYoutubeUrl(transcript)) {
    progressCallback?.("Resolving URL to transcript for workflow...");
    transcript = await createScrapYoutubeTool(input).invoke({ youtube_url: transcript });
    if (transcript.startsWith("Error")) throw new Error(transcript);
  }

  const result = await createSummarizationGraph().invoke({
    transcript,
    analysis_model: input.analysis_model ?? ANALYSIS_CONFIG.MODEL,
    quality_model: input.quality_model ?? ANALYSIS_CONFIG.QUALITY_MODEL,
    target_language: input.target_language ?? "auto",
    analysis: null,
    quality: null,
    iteration_count: 0,
    is_complete: false,
    apiKey,
    progressCallback,
  });

  return {
    analysis: result.analysis!,
    quality: result.quality,
    iteration_count: result.iteration_count,
    quality_score: result.quality ? calculateScore(result.quality) : 0,
    summary_text: formatAnalysisAsMarkdown(result.analysis!),
  };
}

export { PromptBuilder };
