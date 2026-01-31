import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

import { getGeminiApiKey } from "@/core/runtimeConfig";

import {
  GeminiVideoAnalysisSchema,
  type GeminiVideoAnalysis,
} from "./geminiSchemas";

export type GeminiNativeInput =
  | {
      kind: "youtube_url";
      videoUrl: string;
      targetLanguage?: string;
    }
  | {
      kind: "transcript";
      transcript: string;
      targetLanguage?: string;
    };

export async function summarizeWithGeminiNative(
  input: GeminiNativeInput,
  options?: {
    model?: string;
    thinkingLevel?: ThinkingLevel;
    timeoutMs?: number;
  },
): Promise<{ analysis: GeminiVideoAnalysis; usage?: unknown }> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error("Gemini API key missing");

  const client = new GoogleGenAI({ apiKey });
  const model = options?.model ?? "gemini-3-flash-preview";
  const thinkingLevel = options?.thinkingLevel ?? ThinkingLevel.MEDIUM;
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;

  const prompt = buildPrompt(input.targetLanguage ?? "auto");

  const contents =
    input.kind === "youtube_url"
      ? ([{ fileData: { fileUri: input.videoUrl } }, { text: prompt }] as const)
      : ([{ text: `${prompt}\n\nTranscript:\n${input.transcript}` }] as const);

  const response = await client.models.generateContent({
    model,
    contents: contents as any,
    config: {
      httpOptions: { timeout: timeoutMs },
      thinkingConfig: { thinkingLevel },
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(GeminiVideoAnalysisSchema),
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned empty response");

  const parsed = GeminiVideoAnalysisSchema.parse(JSON.parse(raw));
  return { analysis: parsed, usage: response.usageMetadata };
}

function buildPrompt(targetLanguage: string): string {
  const langRule =
    targetLanguage === "auto"
      ? "Traditional Chinese if the video is in Chinese, otherwise English."
      : `Write ALL output in ${targetLanguage}.`;

  return `
1) Analyze in chronological order.
2) Build the chapter list in the same chronological order (merge adjacent segments when needed).
3) Write overallSummary AFTER chapters, based on the chapter sequence (end-to-end arc + main thesis).

Requirements:
- Output fields:
  - chapters
  - overallSummary
- Chapters:
  - Must be chronological and non-overlapping.
  - Each chapter must have a clear title and a substantive description with key viewpoints/arguments and concrete facts (numbers/names/steps when present).
  - If unsure about timestamps, you may omit startTime/endTime.
- Overall summary:
  - Summarize the whole content end-to-end using direct statements.
  - Avoid meta-language like "the video..." / "the author..." / "the speaker...".

STRICT FILTERING:
- NEVER include sponsor/advertisement/promotion sections as chapters.
- If a segment contains sponsorship language (e.g., sponsor, ad, promotion, "brought to you by", "thanks to", discount codes, affiliate links, subscribe/like CTAs), OMIT it entirely and stitch the surrounding content together.
- Do not output chapters with empty or near-empty titles/descriptions; merge with adjacent chapters instead.
- When unsure whether a segment is sponsored/promotional, exclude it.

Language: ${langRule}
`.trim();
}
