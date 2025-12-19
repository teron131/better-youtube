/**
 * Summary Workflow using LangChain, LangGraph, and Zod
 * Implements analysis generation with quality verification and refinement loop
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { END, START, StateGraph } from "@langchain/langgraph/web";
import { ChatOpenAI } from "@langchain/openai";
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

  // Key Facts
  if (analysis.key_facts && analysis.key_facts.length > 0) {
    parts.push("## Key Facts");
    parts.push("");
    analysis.key_facts.forEach((fact) => {
      parts.push(`- ${fact}`);
    });
    parts.push("");
  }

  return parts.join("\n");
}

export interface SummarizationInput {
  transcript: string;
  analysis_model?: string;
  quality_model?: string;
  target_language?: string;
}

/**
 * Execute the summarization workflow
 */
export async function executeSummarizationWorkflow(
  input: SummarizationInput,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<SummarizerOutput> {
  const graph = createSummarizationGraph();

  const initialState: GraphState = {
    transcript: input.transcript,
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
