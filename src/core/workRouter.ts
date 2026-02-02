export type SummarizerProviderPreference = "auto" | "gemini" | "openrouter";
export type SummarizerModePreference = "native" | "react" | "fast";
export type TranscriptProviderPreference = "scrapeCreators" | "supadata";

export type EffectiveSummarizerProvider = "gemini" | "openrouter";
export type EffectiveOpenRouterMode = "react" | "fast";

export function isGeminiModelSelection(modelSelection: string): boolean {
  const s = String(modelSelection || "");
  return s.startsWith("gemini-") || s.startsWith("google/gemini-");
}

export function resolveSummarizationRoute(input: {
  providerPreference: SummarizerProviderPreference;
  modePreference: SummarizerModePreference;
  modelSelection: string;
  hasGeminiKey: boolean;
  hasOpenRouterKey: boolean;
}): {
  provider: EffectiveSummarizerProvider;
  openRouterMode: EffectiveOpenRouterMode | null;
} {
  const {
    providerPreference,
    modePreference,
    modelSelection,
    hasGeminiKey,
    hasOpenRouterKey,
  } = input;

  // Mode can force the provider.
  if (modePreference === "native") {
    return { provider: "gemini", openRouterMode: null };
  }

  // Provider preference (subject to key availability).
  let provider: EffectiveSummarizerProvider;
  if (providerPreference === "gemini") provider = "gemini";
  else if (providerPreference === "openrouter") provider = "openrouter";
  else {
    // auto: prefer native Gemini when the selected model is Gemini and we have a key.
    provider =
      hasGeminiKey && isGeminiModelSelection(modelSelection)
        ? "gemini"
        : "openrouter";
  }

  // Enforce "only Gemini models can call Gemini" unless mode forced native.
  if (provider === "gemini" && !isGeminiModelSelection(modelSelection)) {
    provider = "openrouter";
  }

  // Key-based fallback.
  if (provider === "gemini" && !hasGeminiKey && hasOpenRouterKey) {
    provider = "openrouter";
  }
  if (provider === "openrouter" && !hasOpenRouterKey && hasGeminiKey) {
    provider = "gemini";
  }

  const openRouterMode: EffectiveOpenRouterMode | null =
    provider === "openrouter"
      ? modePreference === "fast"
        ? "fast"
        : "react"
      : null;

  return { provider, openRouterMode };
}
