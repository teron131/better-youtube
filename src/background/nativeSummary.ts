/** Executes the native Gemini summary path against either a YouTube URL or a provided transcript. */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

import type { Summary } from "@/core/types";

import { SummaryArtifactSchema } from "../core/agent/artifact.ts";
import type { AppConfig } from "../core/config.ts";

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
    model: string;
    thinkingLevel?: ThinkingLevel;
    timeoutMs?: number;
  },
  config: Pick<AppConfig, "geminiApiKey">,
): Promise<{ summary: Summary; usage?: unknown }> {
  if (!config.geminiApiKey) throw new Error("Gemini API key missing");
  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const thinkingLevel = options.thinkingLevel ?? ThinkingLevel.MEDIUM;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  const prompt = summaryPrompt(input.targetLanguage ?? "auto", input.kind);

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
      responseJsonSchema: z.toJSONSchema(SummaryArtifactSchema),
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned empty response");

  const parsed = SummaryArtifactSchema.parse(JSON.parse(raw)) as Summary;
  return { summary: parsed, usage: response.usageMetadata };
}

/** Keeps native video input's visual grounding rules separate from transcript-only agent instructions. */
function summaryPrompt(targetLanguage: string, kind: GeminiInput["kind"]): string {
  const languages: Record<string, string> = {
    auto: "Use the same language as the transcript, or English if the transcript language is unclear",
    en: "English (US)",
    "zh-TW": "Traditional Chinese (繁體中文)",
  };
  const language = languages[targetLanguage] || targetLanguage;
  const instruction =
    targetLanguage === "auto"
      ? language
      : `Write ALL output in ${language}. Do not use English or any other language.`;
  const sourceRule =
    kind === "youtube_url"
      ? "You are given the full video. Use BOTH spoken content and visuals (on-screen text/slides/charts/code/UI). Do not invent details that are not clearly supported by what you can see/hear."
      : "You are given a transcript only. Ground the summary ONLY in the transcript text and do not add visual-only details.";
  return [
    "Create a grounded, chronological summary.",
    "",
    `- OUTPUT LANGUAGE (REQUIRED): ${instruction}`,
    "",
    `SOURCE: ${sourceRule}`,
    "",
    "Return JSON only (no extra text) with:",
    "- overview: string",
    "- chapters: array of { title: string, description: string, startTime?: string, endTime?: string }",
    "(startTime/endTime are optional MM:SS; omit if unsure)",
    "",
    "Rules:",
    "- Chapters must be chronological and non-overlapping",
    "- Avoid meta-language (no 'this video...' framing)",
    "- Exclude sponsors/promos/calls to action entirely",
  ].join("\n");
}
