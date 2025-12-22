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

const FAST_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";

/**
 * Create OpenRouter LLM instance using LangChain
 */
function createOpenRouterLLM(model: string, apiKey: string): ChatOpenAI {
  return new ChatOpenAI({
    model: model,
    apiKey: apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
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
      // If we already have the transcript for this URL, just return it
      const isUrl = isYoutubeUrl(input.transcript_or_url);
      if (!isUrl && (youtube_url.includes(input.videoId || "") || !input.videoId)) {
        return input.transcript_or_url;
      }

      if (!input.scrapeCreatorsApiKey) {
        return "Error: Scrape Creators API key not provided to the tool.";
      }

      try {
        const response = await fetch(
          `https://api.scrapecreators.com/v1/youtube/video?url=${youtube_url}&get_transcript=true`,
          {
            headers: {
              "x-api-key": input.scrapeCreatorsApiKey,
              "Accept": "application/json",
            },
          }
        );

        if (!response.ok) {
          return `Error fetching transcript: ${response.status} ${response.statusText}`;
        }

        const data = await response.json();
        const transcript = data.transcript_only_text || (data.transcript as any[])?.map((s) => s.text).join(" ") || "";
        
        if (!transcript) {
          return "Error: No transcript found for this video.";
        }

        return transcript;
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

const GARBAGE_FILTER_PROMPT = "Identify and remove garbage sections such as promotional and meaningless content such as cliche intros, outros, filler, sponsorships, and other irrelevant segments from the transcript. The transcript has line tags like [L1], [L2], etc. Return the ranges of tags that should be removed to clean the transcript.";

function createGarbageFilterMiddleware(apiKey: string) {
  return createMiddleware({
    name: "garbageFilterMiddleware",
    wrapToolCall: async (request, handler) => {
      const toolName = request.tool?.name ?? request.toolCall.name;
      if (toolName !== "scrap_youtube_tool") {
        return handler(request);
      }

      const result = await handler(request);
      if (!ToolMessage.isInstance(result) || result.status === "error") {
        return result;
      }

      const transcript = typeof result.content === "string" ? result.content : "";
      if (!transcript.trim() || transcript.startsWith("Error")) {
        return result;
      }

      const taggedTranscript = tagContent(transcript);
      const llm = createOpenRouterLLM(FAST_MODEL, apiKey);
      const structuredLLM = llm.withStructuredOutput(GarbageIdentificationSchema, {
        method: "jsonMode",
      });

      const prompt = ChatPromptTemplate.fromMessages([
        ["system", GARBAGE_FILTER_PROMPT],
        ["human", "{tagged_transcript}"],
      ]);

      try {
        const garbage = await prompt.pipe(structuredLLM).invoke({
          tagged_transcript: taggedTranscript,
        });

        if (garbage.garbage_ranges?.length) {
          const filteredTranscript = filterContent(taggedTranscript, garbage.garbage_ranges);
          result.content = untagContent(filteredTranscript);
          console.log(
            `🧹 Middleware removed ${garbage.garbage_ranges.length} garbage sections from tool result.`
          );
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

/**
 * Analysis node: Generate or refine analysis
 */
async function analysisNode(state: GraphState): Promise<Partial<GraphState>> {
  const apiKey = state.apiKey!;
  const progressCallback = state.progressCallback as ((msg: string) => void) | undefined;

  if (progressCallback) {
    if (state.quality && state.analysis) {
      progressCallback("Refining analysis based on quality feedback...");
    } else {
      progressCallback(
        `Generating initial analysis. Transcript length: ${state.transcript.length} characters`
      );
    }
  }

  const llm = createOpenRouterLLM(state.analysis_model!, apiKey);
  const structuredLLM = llm.withStructuredOutput(AnalysisSchema);

  let prompt: ChatPromptTemplate;

  // Refinement path
  if (state.quality && state.analysis) {
    const improvementContext = `# Improve this video analysis based on the following feedback:

## Analysis:

${JSON.stringify(state.analysis, null, 2)}

## Quality Assessment:

${JSON.stringify(state.quality, null, 2)}

Please provide an improved version that addresses the specific issues identified above to improve the overall quality score.`;

    const improvementSystemPrompt = PromptBuilder.buildImprovementPrompt(
      state.target_language || "auto"
    );
    const transcriptContext = `Original Transcript:\n${state.transcript}`;
    const fullImprovementPrompt = `${transcriptContext}\n\n${improvementContext}`;

    prompt = ChatPromptTemplate.fromMessages([
      ["system", improvementSystemPrompt],
      ["human", "{improvement_prompt}"],
    ]);

    const chain = prompt.pipe(structuredLLM);
    const result = await chain.invoke({
      improvement_prompt: fullImprovementPrompt,
    });

    if (progressCallback) {
      progressCallback("Analysis refined successfully");
    }

    return {
      analysis: result as Analysis,
      iteration_count: state.iteration_count + 1,
    };
  } else {
    // Generation path
    const targetLang = state.target_language || "auto";
    const analysisPrompt = PromptBuilder.buildAnalysisPrompt(targetLang);

    prompt = ChatPromptTemplate.fromMessages([
      ["system", analysisPrompt],
      ["human", "{content}"],
    ]);

    const chain = prompt.pipe(structuredLLM);
    const result = await chain.invoke({ content: state.transcript });

    if (progressCallback) {
      progressCallback("Analysis completed");
    }

    return {
      analysis: result as Analysis,
      iteration_count: state.iteration_count + 1,
    };
  }
}

/**
 * Quality node: Evaluate analysis quality
 */
async function qualityNode(state: GraphState): Promise<Partial<GraphState>> {
  const apiKey = state.apiKey!;
  const progressCallback = state.progressCallback as ((msg: string) => void) | undefined;

  if (progressCallback) {
    progressCallback("Performing quality check...");
    progressCallback(`Using model: ${state.quality_model}`);
  }

  const llm = createOpenRouterLLM(state.quality_model!, apiKey);
  const structuredLLM = llm.withStructuredOutput(QualitySchema, {
    method: "jsonMode",
  });

  const qualityPrompt = PromptBuilder.buildQualityPrompt();
  const analysisText = JSON.stringify(state.analysis, null, 2);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", qualityPrompt],
    ["human", "{analysis_text}"],
  ]);

  const chain = prompt.pipe(structuredLLM);
  const quality = await chain.invoke({ analysis_text: analysisText });

  printQualityBreakdown(quality);

  const percentageScore = calculateScore(quality);
  const isComplete =
    percentageScore >= ANALYSIS_CONFIG.MIN_QUALITY_SCORE ||
    state.iteration_count >= ANALYSIS_CONFIG.MAX_ITERATIONS;

  return {
    quality: quality,
    is_complete: isComplete,
  };
}

/**
 * Conditional routing function
 */
function shouldContinue(state: GraphState): string {
  if (state.is_complete) {
    console.log("Workflow complete (is_complete=True)");
    return END;
  }

  const percentageScore = state.quality ? calculateScore(state.quality) : 0;

  if (
    state.quality &&
    !isAcceptable(state.quality) &&
    state.iteration_count < ANALYSIS_CONFIG.MAX_ITERATIONS
  ) {
    console.log(
      `Quality ${percentageScore}% below threshold ${ANALYSIS_CONFIG.MIN_QUALITY_SCORE}%, refining (iteration ${state.iteration_count + 1})`
    );
    return "analysisNode";
  }

  console.log(
    `Workflow ending (quality: ${percentageScore}%, iterations: ${state.iteration_count})`
  );
  return END;
}

// ============================================================================ 
// Graph Workflow
// ============================================================================ 

/**
 * Create and compile the summarization graph
 */
function createSummarizationGraph() {
  const workflow = new StateGraph(GraphStateSchema)
    .addNode("analysisNode", analysisNode)
    .addNode("qualityNode", qualityNode)
    .addEdge(START, "analysisNode")
    .addEdge("analysisNode", "qualityNode")
    .addConditionalEdges("qualityNode", shouldContinue, {
      analysisNode: "analysisNode",
      [END]: END,
    });

  return workflow.compile();
}

/**
 * Format analysis as markdown
 */
function formatAnalysisAsMarkdown(analysis: Analysis): string {
  const parts: string[] = [];

  // Title
  if (analysis.title) {
    parts.push(`# ${analysis.title}`);
    parts.push("");
  }

  // Summary
  parts.push("## Summary");
  parts.push("");
  parts.push(analysis.summary);
  parts.push("");

  // Takeaways
  if (analysis.takeaways && analysis.takeaways.length > 0) {
    parts.push("## Key Takeaways");
    parts.push("");
    analysis.takeaways.forEach((takeaway) => {
      parts.push(`- ${takeaway}`);
    });
    parts.push("");
  }

  // Chapters
  if (analysis.chapters && analysis.chapters.length > 0) {
    parts.push("## Chapters");
    parts.push("");
    analysis.chapters.forEach((chapter) => {
      parts.push(`### ${chapter.header}`);
      parts.push("");
      parts.push(chapter.summary);
      parts.push("");
      if (chapter.key_points && chapter.key_points.length > 0) {
        chapter.key_points.forEach((point) => {
          parts.push(`- ${point}`);
        });
        parts.push("");
      }
    });
  }

  // Keywords
  if (analysis.keywords && analysis.keywords.length > 0) {
    parts.push("## Keywords");
    parts.push("");
    parts.push(analysis.keywords.map((kw) => `\`${kw}\``).join("  "));
    parts.push("");
  }

  return parts.join("\n");
}

export interface SummarizationInput {
  transcript_or_url: string;
  videoId?: string;
  scrapeCreatorsApiKey?: string;
  analysis_model?: string;
  quality_model?: string;
  target_language?: string;
  fast_mode?: boolean;
}

/**
 * Check if input is a YouTube URL
 */
function isYoutubeUrl(input: string): boolean {
  return input.includes("youtube.com/watch") || input.includes("youtu.be/");
}

/**
 * Execute fast summarization using a ReAct Agent - aligned with summarizer_lite.py
 */
async function executeFastSummarization(
  input: SummarizationInput,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<SummarizerOutput> {
  const isUrl = isYoutubeUrl(input.transcript_or_url);
  
  if (progressCallback) {
    const type = isUrl ? "URL" : "Transcript";
    progressCallback(`Generating analysis in Fast Mode (Agent) from ${type}.`);
  }

  const model = input.analysis_model || ANALYSIS_CONFIG.MODEL;
  const llm = createOpenRouterLLM(model, apiKey);
  const targetLang = input.target_language || "auto";

  // Only provide the tool if the input is a URL
  const tools = isUrl ? [createScrapYoutubeTool(input)] : [];

  const systemPrompt = PromptBuilder.buildAnalysisPrompt(targetLang);
  const humanPrompt = isUrl 
    ? `Analyze the video at this URL:\n\n${input.transcript_or_url}`
    : `Analyze this transcript:\n\n${input.transcript_or_url}`;

  const agent = createAgent({
    model: llm,
    tools: tools,
    systemPrompt: systemPrompt,
    responseFormat: toolStrategy(AnalysisSchema),
    middleware: isUrl ? [createGarbageFilterMiddleware(apiKey)] : [],
  });

  const response = await agent.invoke({
    messages: [new HumanMessage(humanPrompt)],
  });

  const structuredResponse = response.structuredResponse;
  if (structuredResponse === null || structuredResponse === undefined) {
    throw new Error("Agent did not return structured response");
  }
  const analysis = structuredResponse as Analysis;

  if (progressCallback) {
    progressCallback("Fast analysis completed");
  }

  const summaryText = formatAnalysisAsMarkdown(analysis);

  return {
    analysis: analysis,
    quality: null,
    iteration_count: 1,
    quality_score: 0,
    summary_text: summaryText,
  };
}

/**
 * Execute the summarization workflow
 */
export async function executeSummarizationWorkflow(
  input: SummarizationInput,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<SummarizerOutput> {
  if (input.fast_mode) {
    return executeFastSummarization(input, apiKey, progressCallback);
  }

  const graph = createSummarizationGraph();

  // For the Graph workflow, we currently expect a transcript.
  // We resolve it here if it's a URL.
  let transcript = input.transcript_or_url;
  if (isYoutubeUrl(transcript)) {
    if (progressCallback) progressCallback("Resolving URL to transcript for workflow...");
    // Note: Graph workflow doesn't have tools in analysisNode yet, 
    // so we must resolve it before starting.
    const tool = createScrapYoutubeTool(input);
    transcript = await tool.invoke({ youtube_url: input.transcript_or_url });
    
    if (transcript.startsWith("Error")) {
       throw new Error(transcript);
    }
  }

  const initialState: GraphState = {
    transcript: transcript,
    analysis_model: input.analysis_model || ANALYSIS_CONFIG.MODEL,
    quality_model: input.quality_model || ANALYSIS_CONFIG.QUALITY_MODEL,
    target_language: input.target_language || "auto",
    analysis: null,
    quality: null,
    iteration_count: 0,
    is_complete: false,
    apiKey: apiKey,
    progressCallback: progressCallback,
  };

  const result = await graph.invoke(initialState);

  const percentageScore = result.quality ? calculateScore(result.quality) : 0;
  const summaryText = formatAnalysisAsMarkdown(result.analysis!);

  return {
    analysis: result.analysis!,
    quality: result.quality,
    iteration_count: result.iteration_count,
    quality_score: percentageScore,
    summary_text: summaryText,
  };
}

export { PromptBuilder };
