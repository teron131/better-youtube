export type SummarizerProviderPreference = "auto" | "gemini" | "llm";
export type SummarizerModePreference = "native" | "validation" | "fast";

export type EffectiveSummarizerProvider = "gemini" | "llm";
export type EffectiveLlmMode = "react" | "fast";

export function isGeminiModelSelection(modelSelection: string): boolean {
  const s = String(modelSelection || "");
  return s.startsWith("gemini-") || s.startsWith("google/gemini-");
}

function resolveProvider(
  requestedProvider: SummarizerProviderPreference | undefined,
  summarizerModel: string | undefined,
  hasGeminiKey: boolean,
  hasLlmKey: boolean,
): EffectiveSummarizerProvider {
  const canUseGemini = hasGeminiKey && isGeminiModelSelection(summarizerModel || "");
  const canUseLlm = hasLlmKey;

  if (requestedProvider === "gemini") {
    if (canUseGemini) return "gemini";
    if (canUseLlm) return "llm";
    throw new Error("No valid summarizer provider available (missing API keys)");
  }

  if (requestedProvider === "llm") {
    if (canUseLlm) return "llm";
    if (canUseGemini) return "gemini";
    throw new Error("No valid summarizer provider available (missing API keys)");
  }

  if (canUseLlm) return "llm";
  if (canUseGemini) return "gemini";

  // Last chance: if Gemini key exists but model isn't a Gemini model, we can't call Gemini.
  throw new Error("No valid summarizer provider available (missing API keys)");
}

export interface ResolveSummarizationRouteInput {
  requestedProvider?: SummarizerProviderPreference;
  requestedMode?: SummarizerModePreference;
  summarizerModel?: string;
  hasGeminiKey: boolean;
  hasLlmKey: boolean;
}

export interface ResolvedSummarizationRoute {
  provider: "gemini" | "llm";
  // LLM internal mode.
  llmMode?: "react" | "fast";
  // External mode preference.
  modePreference: SummarizerModePreference;
}

export function resolveSummarizationRoute(
  input: ResolveSummarizationRouteInput,
): ResolvedSummarizationRoute {
  const requestedMode = input.requestedMode;

  const provider = resolveProvider(
    input.requestedProvider,
    input.summarizerModel,
    input.hasGeminiKey,
    input.hasLlmKey,
  );

  if (provider === "gemini" && requestedMode === "native") {
    return {
      provider,
      modePreference: "native",
    };
  }

  // LLM has no native mode; use validation unless explicitly fast.
  const modePreference: SummarizerModePreference = requestedMode === "fast" ? "fast" : "validation";

  if (provider === "llm") {
    return {
      provider,
      modePreference,
      llmMode: modePreference === "fast" ? "fast" : "react",
    };
  }

  return {
    provider,
    modePreference,
  };
}
