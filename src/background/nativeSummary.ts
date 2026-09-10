/** Executes the native Gemini summary path against either a YouTube URL or a provided transcript. */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { SummaryTextSchema } from "../core/agent/artifact.ts";
import { SKILLS } from "../core/agent/skills.ts";
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
    signal?: AbortSignal;
  },
  config: Pick<AppConfig, "geminiApiKey">,
): Promise<{ summary: string; usage?: unknown }> {
  options.signal?.throwIfAborted();
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
      abortSignal: options.signal,
      thinkingConfig: { thinkingLevel },
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned empty response");

  const parsed = SummaryTextSchema.parse(raw);
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
    "Write a grounded Markdown summary directly in your response.",
    "",
    `- OUTPUT LANGUAGE (REQUIRED): ${instruction}`,
    "",
    `SOURCE: ${sourceRule}`,
    "",
    SKILLS.find((skill) => skill.name === "summary")!.content,
    "For this direct response, return the final Markdown text without tool calls or a surrounding code fence.",
  ].join("\n");
}
