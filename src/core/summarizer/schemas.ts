import * as z from "zod";

/**
 * Chapter output schema
 */
export const ChapterSchema = z.object({
  startTime: z
    .string()
    .describe("Optional chapter start timestamp in the format MM:SS.")
    .optional(),
  endTime: z
    .string()
    .describe("Optional chapter end timestamp matching the same format as startTime.")
    .optional(),
  title: z.string().describe("A concise chapter heading."),
  description: z
    .string()
    .describe(
      "A substantive chapter description grounded in the transcript. Include key facts (numbers/names/steps) when present. Avoid meta-language like 'this video...' and do not include sponsorship/promotional content.",
    ),
});

export type Chapter = z.infer<typeof ChapterSchema>;

/**
 * Summary output schema
 */
export const SummarySchema = z.object({
  chapters: z
    .array(ChapterSchema)
    .min(1)
    .describe("Chronological, non-overlapping chapters covering the core content."),
  overallSummary: z
    .string()
    .describe(
      "An end-to-end summary of the whole content (main thesis + arc), written in direct statements without meta-language.",
    ),
});

export type Summary = z.infer<typeof SummarySchema>;

/**
 * Rate schema for quality assessment
 */
export const RateSchema = z.object({
  rate: z
    .enum(["Fail", "Refine", "Pass"])
    .describe(
      "Score for the quality aspect (Fail=poor, Refine=adequate, Pass=excellent)",
    ),
  reason: z.string().describe("Reason for the score"),
});

export type Rate = z.infer<typeof RateSchema>;

/**
 * Quality assessment schema
 */
export const QualitySchema = z.object({
  completeness: RateSchema.describe(
    "Rate for completeness: The entire transcript has been considered",
  ),
  structure: RateSchema.describe(
    "Rate for structure: Output follows the required schema (overallSummary + chapters with title/description)",
  ),
  no_garbage: RateSchema.describe(
    "Rate for no_garbage: Promotional and meaningless content are removed",
  ),
  meta_language_avoidance: RateSchema.describe(
    "Rate for meta_language_avoidance: No meta-descriptive language like 'This video explains...'",
  ),
  correct_language: RateSchema.describe(
    "Rate for correct_language: Output is in the correct target language",
  ),
});

export type Quality = z.infer<typeof QualitySchema>;

/**
 * Graph state schema for LangGraph workflow
 */
export const GraphStateSchema = z.object({
  transcript: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  summary_model: z.string().optional(),
  quality_model: z.string().optional(),
  target_language: z.string().default("auto"),
  summary: SummarySchema.nullable().default(null),
  quality: QualitySchema.nullable().default(null),
  iteration_count: z.number().default(0),
  is_complete: z.boolean().default(false),
  onProgress: z.any().optional(),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

/**
 * Summarizer output
 */
export interface SummarizerOutput {
  summary: Summary;
  quality: Quality | null;
  iteration_count: number;
  quality_score: number;
  summary_text: string;
}
