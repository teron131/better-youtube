/**
 * Summary Workflow using LangChain, LangGraph, and Zod
 * Implements analysis generation with quality verification and refinement loop
 */

import { tool } from "@langchain/core/tools";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { PromptBuilder } from "./promptBuilder";
import { QualityUtils, SUMMARY_CONFIG } from "./qualityUtils";
import { AnalysisSchema, GraphStateSchema, QualitySchema } from "./schemas";
import type { Analysis, GraphState, SummarizerOutput } from "./schemas";

// ============================================================================ 
// Model Client
// ============================================================================ 

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

    const improvementSystemPrompt = PromptBuilder.buildImprovementPrompt();
    const transcriptContext = `Original Transcript:\n${state.transcript}`;
    const fullImprovementPrompt = `${transcriptContext}\n\n${improvementContext}`;

    const languageInstruction = PromptBuilder._getLanguageInstruction(
      state.target_language || "auto",
      true
    );

    prompt = ChatPromptTemplate.fromMessages([
      ["system", improvementSystemPrompt + languageInstruction],
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

    const humanMessage = 
      targetLang === "auto"
        ? "{content}"
        : `{content}\n\nRemember: Write ALL output in ${PromptBuilder.LANGUAGE_DESCRIPTIONS[targetLang] || targetLang}. Do not use English or any other language.`;

    prompt = ChatPromptTemplate.fromMessages([
      ["system", analysisPrompt],
      ["human", humanMessage],
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

  QualityUtils.printQualityBreakdown(quality);

  const percentageScore = QualityUtils.calculateScore(quality);
  const isComplete = 
    percentageScore >= SUMMARY_CONFIG.MIN_QUALITY_SCORE ||
    state.iteration_count >= SUMMARY_CONFIG.MAX_ITERATIONS;

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

  const percentageScore = state.quality ? QualityUtils.calculateScore(state.quality) : 0;

  if (
    state.quality &&
    !QualityUtils.isAcceptable(state.quality) &&
    state.iteration_count < SUMMARY_CONFIG.MAX_ITERATIONS
  ) {
    console.log(
      `Quality ${percentageScore}% below threshold ${SUMMARY_CONFIG.MIN_QUALITY_SCORE}%, refining (iteration ${state.iteration_count + 1})`
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
 * Execute fast summarization using direct LLM with structured output
 * This is a lightweight single-pass approach without quality verification
 */
async function executeFastSummarization(
  input: SummarizationInput,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<SummarizerOutput> {
  const isUrl = isYoutubeUrl(input.transcript_or_url);

  // If input is a URL, we need to fetch the transcript first
  let transcript = input.transcript_or_url;
  if (isUrl) {
    if (progressCallback) {
      progressCallback("Fast Mode: Fetching transcript from URL...");
    }
    const scrapeTool = createScrapYoutubeTool(input);
    transcript = await scrapeTool.invoke({ youtube_url: input.transcript_or_url });

    if (transcript.startsWith("Error")) {
      throw new Error(transcript);
    }
  }

  if (progressCallback) {
    progressCallback(`Fast Mode: Generating analysis. Transcript length: ${transcript.length} characters`);
  }

  const model = input.analysis_model || SUMMARY_CONFIG.ANALYSIS_MODEL;
  const llm = createOpenRouterLLM(model, apiKey);
  const structuredLLM = llm.withStructuredOutput(AnalysisSchema);

  const targetLang = input.target_language || "auto";
  const systemPrompt = PromptBuilder.buildAnalysisPrompt(targetLang);

  const humanMessage =
    targetLang === "auto"
      ? transcript
      : `${transcript}\n\nRemember: Write ALL output in ${PromptBuilder.LANGUAGE_DESCRIPTIONS[targetLang] || targetLang}. Do not use English or any other language.`;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{content}"],
  ]);

  const chain = prompt.pipe(structuredLLM);
  const analysis = await chain.invoke({ content: humanMessage }) as Analysis;

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
    analysis_model: input.analysis_model || SUMMARY_CONFIG.ANALYSIS_MODEL,
    quality_model: input.quality_model || SUMMARY_CONFIG.QUALITY_MODEL,
    target_language: input.target_language || "auto",
    analysis: null,
    quality: null,
    iteration_count: 0,
    is_complete: false,
    apiKey: apiKey,
    progressCallback: progressCallback,
  };

  const result = await graph.invoke(initialState);

  const percentageScore = result.quality ? QualityUtils.calculateScore(result.quality) : 0;
  const summaryText = formatAnalysisAsMarkdown(result.analysis!);

  return {
    analysis: result.analysis!,
    quality: result.quality,
    iteration_count: result.iteration_count,
    quality_score: percentageScore,
    summary_text: summaryText,
  };
}

export { PromptBuilder, QualityUtils };