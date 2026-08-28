/** Runs native Gemini summaries against either a YouTube URL or a provided transcript. */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { Summary } from "@/core/types";

import { PromptBuilder } from "./promptBuilder";
import { SummarySchema } from "./schemas";

export type GeminiInput =
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

export async function summarizeGemini(
  input: GeminiInput,
  options: {
    apiKey: string;
    model: string;
    thinkingLevel?: ThinkingLevel;
    timeoutMs?: number;
  },
): Promise<{ summary: Summary; usage?: unknown }> {
  const client = new GoogleGenAI({ apiKey: options.apiKey });
  const thinkingLevel = options.thinkingLevel ?? ThinkingLevel.MEDIUM;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  const prompt = PromptBuilder.getGeminiSummaryPrompt(input.targetLanguage ?? "auto", input.kind);

  const contents =
    input.kind === "youtube_url"
      ? ([{ fileData: { fileUri: input.videoUrl } }, { text: prompt }] as const)
      : ([{ text: `${prompt}\n\nTranscript:\n${input.transcript}` }] as const);

  const response = await client.models.generateContent({
    model: options.model,
    contents: contents as unknown as Parameters<
      typeof client.models.generateContent
    >[0]["contents"],
    config: {
      httpOptions: { timeout: timeoutMs },
      thinkingConfig: { thinkingLevel },
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(SummarySchema),
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned empty response");

  const parsed = SummarySchema.parse(JSON.parse(raw)) as Summary;
  return { summary: parsed, usage: response.usageMetadata };
}
