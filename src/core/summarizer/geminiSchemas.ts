import { z } from "zod";

export const GeminiChapterSchema = z.object({
  startTime: z
    .string()
    .describe(
      "Chapter start timestamp in the format MM:SS so the section can be referenced precisely.",
    )
    .optional(),
  endTime: z
    .string()
    .describe("Chapter end timestamp matching the same format as startTime.")
    .optional(),
  title: z
    .string()
    .describe("A concise heading summarizing the chapter's main topic."),
  description: z
    .string()
    .describe(
      "A detailed chapter description capturing key viewpoints, claims, and concrete facts mentioned (include important numbers/names/steps when present). Avoid meta-language like 'the video', 'the author', 'the speaker says'—state the content directly.",
    ),
});

export type GeminiChapter = z.infer<typeof GeminiChapterSchema>;

export const GeminiVideoAnalysisSchema = z
  .object({
    chapters: z
      .array(GeminiChapterSchema)
      .min(1)
      .describe(
        "Chronological, non-ad chapters that capture the video's core scenes.",
      ),
    overallSummary: z
      .string()
      .describe(
        "An overall summary covering the full video end-to-end, written without meta-language and capturing the main thesis and arc.",
      ),
  })
  .describe(
    "A multimodal summary describing chapter structure, visuals, and transcripts.",
  );

export type GeminiVideoAnalysis = z.infer<typeof GeminiVideoAnalysisSchema>;
