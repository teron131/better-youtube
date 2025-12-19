import * as z from "zod";

/**
 * Chapter output schema
 */
export const ChapterSchema = z.object({
  header: z.string().describe("A descriptive title for the chapter"),
  summary: z.string().describe("A comprehensive summary of the chapter content"),
  key_points: z
    .array(z.string())
    .describe("Important takeaways and insights from this chapter"),
});

export type Chapter = z.infer<typeof ChapterSchema>;

/**
 * Analysis output schema
 */
export const AnalysisSchema = z.object({
  title: z.string().describe("The main title or topic of the video content"),
  summary: z
    .string()
    .describe("A comprehensive summary of the video content"),
  takeaways: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe("Key insights and actionable takeaways for the audience"),
  chapters: z
    .array(ChapterSchema)
    .describe("Structured breakdown of content into logical chapters"),
  keywords: z
    .array(z.string())
    .min(3)
    .max(3)
    .describe("The most relevant keywords in the analysis worthy of highlighting"),
  target_language: z
    .string()
    .nullable()
    .describe("The language the content to be translated to"),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/**
 * Rate schema for quality assessment
 */
export const RateSchema = z.object({
  rate: z
    .enum(["Fail", "Refine", "Pass"])
    .describe("Score for the quality aspect (Fail=poor, Refine=adequate, Pass=excellent)"),
  reason: z.string().describe("Reason for the score"),
});

export type Rate = z.infer<typeof RateSchema>;

/**
 * Quality assessment schema - aligned with Python backend's 6 aspects
 */
export const QualitySchema = z.object({
  completeness: RateSchema.describe(
    "Rate for completeness: The entire transcript has been considered"
  ),
  structure: RateSchema.describe(
    "Rate for structure: Summary, takeaways, and key_facts are properly formatted"
  ),
  no_garbage: RateSchema.describe(
    "Rate for no_garbage: Promotional and meaningless content are removed"
  ),
  meta_language_avoidance: RateSchema.describe(
    "Rate for meta_language_avoidance: No meta-descriptive language like 'This video explains...'"
  ),
  useful_keywords: RateSchema.describe(
    "Rate for useful_keywords: Key facts are relevant and useful for understanding"
  ),
  correct_language: RateSchema.describe(
    "Rate for correct_language: Output is in the correct target language"
  ),
});

export type Quality = z.infer<typeof QualitySchema>;

/**
 * Graph state schema for LangGraph workflow
 */
export const GraphStateSchema = z.object({
  transcript: z.string(),
  analysis_model: z.string().optional(),
  quality_model: z.string().optional(),
  target_language: z.string().default("auto"),
  analysis: AnalysisSchema.nullable().default(null),
  quality: QualitySchema.nullable().default(null),
  iteration_count: z.number().default(0),
  is_complete: z.boolean().default(false),
  apiKey: z.string().optional(),
  progressCallback: z.any().optional(),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

/**
 * Summarizer output
 */
export interface SummarizerOutput {
  analysis: Analysis;
  quality: Quality | null;
  iteration_count: number;
  quality_score: number;
  summary_text: string;
}
