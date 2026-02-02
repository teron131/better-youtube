export type SummarizerProviderPreference = "auto" | "gemini" | "openrouter";
export type SummarizerModePreference = "native" | "validation" | "fast";
export type TranscriptProviderPreference = "scrapeCreators" | "supadata";

export type EffectiveSummarizerProvider = "gemini" | "openrouter";
export type EffectiveOpenRouterMode = "react" | "fast";

export function isGeminiModelSelection(modelSelection: string): boolean {
  const s = String(modelSelection || "");
  return s.startsWith("gemini-") || s.startsWith("google/gemini-");
}

function resolveProvider(
  requestedProvider: SummarizerProviderPreference | undefined,
  summarizerModel: string | undefined,
  hasGeminiKey: boolean,
  hasOpenRouterKey: boolean,
): EffectiveSummarizerProvider {
  const canUseGemini =
    hasGeminiKey && isGeminiModelSelection(summarizerModel || "");
  const canUseOpenRouter = hasOpenRouterKey;

  if (requestedProvider === "gemini") {
    if (canUseGemini) return "gemini";
    if (canUseOpenRouter) return "openrouter";
    throw new Error(
      "No valid summarizer provider available (missing API keys)",
    );
  }

  if (requestedProvider === "openrouter") {
    if (canUseOpenRouter) return "openrouter";
    if (canUseGemini) return "gemini";
    throw new Error(
      "No valid summarizer provider available (missing API keys)",
    );
  }

  // Auto: prefer Gemini when the selected model is a Gemini model; otherwise use OpenRouter if available.
  if (canUseGemini) return "gemini";
  if (canUseOpenRouter) return "openrouter";

  // Last chance: if Gemini key exists but model isn't a Gemini model, we can't call Gemini.
  throw new Error("No valid summarizer provider available (missing API keys)");
}

export interface ResolveSummarizationRouteInput {
  requestedProvider?: SummarizerProviderPreference;
  requestedMode?: SummarizerModePreference;
  summarizerModel?: string;
  hasGeminiKey: boolean;
  hasOpenRouterKey: boolean;
}

export interface ResolvedSummarizationRoute {
  provider: "gemini" | "openrouter";
  // OpenRouter internal mode.
  openRouterMode?: "react" | "fast";
  // External mode preference.
  modePreference: SummarizerModePreference;
}

export function resolveSummarizationRoute(
  input: ResolveSummarizationRouteInput,
): ResolvedSummarizationRoute {
  const requestedMode = input.requestedMode;

  // Native mode always uses Gemini.
  if (requestedMode === "native") {
    if (!input.hasGeminiKey) {
      throw new Error("Native mode requires a Gemini API key");
    }
    return {
      provider: "gemini",
      modePreference: "native",
    };
  }

  // Determine provider.
  const provider = resolveProvider(
    input.requestedProvider,
    input.summarizerModel,
    input.hasGeminiKey,
    input.hasOpenRouterKey,
  );

  // Mode preference (non-native): default to validation unless explicitly fast.
  const modePreference: SummarizerModePreference =
    requestedMode === "fast" ? "fast" : "validation";

  if (provider === "openrouter") {
    return {
      provider,
      modePreference,
      openRouterMode: modePreference === "fast" ? "fast" : "react",
    };
  }

  return {
    provider,
    modePreference,
  };
}
