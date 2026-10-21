/** Selects a usable summary provider while preserving explicit preference and fallback order. */

import type { SummarizerProviderPreference } from "./config.ts";

export function isGeminiModelSelection(modelSelection: string): boolean {
  const s = String(modelSelection || "");
  return s.startsWith("gemini-") || s.startsWith("google/gemini-");
}

export interface ResolveSummarizationRouteInput {
  requestedProvider?: SummarizerProviderPreference;
  summarizerModel?: string;
  hasGeminiKey: boolean;
  hasLlmKey: boolean;
}

export interface ResolvedSummarizationRoute {
  provider: "gemini" | "llm";
}

/** Honors an explicit Gemini preference only when a Gemini key and model are both present; otherwise prefers the LLM endpoint, then Gemini, and throws when neither can serve. */
export function resolveSummarizationRoute(
  input: ResolveSummarizationRouteInput,
): ResolvedSummarizationRoute {
  const canUseGemini = input.hasGeminiKey && isGeminiModelSelection(input.summarizerModel || "");
  if (input.requestedProvider === "gemini" && canUseGemini) return { provider: "gemini" };
  if (input.hasLlmKey) return { provider: "llm" };
  if (canUseGemini) return { provider: "gemini" };
  throw new Error("No valid summarizer provider available (missing API keys)");
}
