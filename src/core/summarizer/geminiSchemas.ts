import { z } from "zod";

export const GeminiChapterSchema = z.object({
  startTime: z
    .string()
    .describe("Optional chapter start timestamp in the format MM:SS.")
    .optional(),
  endTime: z
    .string()
    .describe("Optional chapter end timestamp matching the same format as startTime.")
    .optional(),
  title: z
    .string()
    .describe("A concise chapter heading (chronological)."),
  description: z
    .string()
    .describe(
      "A substantive chapter description grounded in the content. Include key facts (numbers/names/steps) when present. Avoid meta-language like 'this video...' and omit sponsorship/promotional segments.",
    ),
});

export type GeminiChapter = z.infer<typeof GeminiChapterSchema>;

export const GeminiVideoAnalysisSchema = z
  .object({
    chapters: z
      .array(GeminiChapterSchema)
      .min(1)
      .describe("Chronological, non-overlapping chapters covering core content."),
    overallSummary: z
      .string()
      .describe(
        "An end-to-end summary of the full content (main thesis + arc), written in direct statements without meta-language.",
      ),
  })
  .describe("Structured summary output (chapters + overallSummary).");

export type GeminiVideoAnalysis = z.infer<typeof GeminiVideoAnalysisSchema>;
