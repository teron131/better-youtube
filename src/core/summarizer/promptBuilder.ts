/** Owns the grounded summary, refinement, and quality prompts shared by model providers. */

const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  auto: "Use the same language as the transcript, or English if the transcript language is unclear",
  en: "English (US)",
  "zh-TW": "Traditional Chinese (繁體中文)",
};

/**
 * Get language instruction for prompts
 */
function getLanguageInstruction(targetLanguage: string, isRefinement = false): string {
  const description = LANGUAGE_DESCRIPTIONS[targetLanguage] || targetLanguage;
  const instruction =
    targetLanguage === "auto"
      ? description
      : `Write ALL output in ${description}. Do not use English or any other language.`;

  const prefix = isRefinement
    ? "\n\nOUTPUT LANGUAGE (REQUIRED): "
    : "- OUTPUT LANGUAGE (REQUIRED): ";
  const suffix = isRefinement ? " All text must be in this language." : "";

  return `${prefix}${instruction}${suffix}`;
}

export class PromptBuilder {
  /**
   * Gemini prompt (supports youtube_url input with visuals)
   */
  static getGeminiSummaryPrompt(
    targetLanguage: string = "auto",
    kind: "youtube_url" | "transcript" = "transcript",
    title?: string,
    description?: string,
  ): string {
    const languageInstruction = getLanguageInstruction(targetLanguage);
    const metadataParts = [];
    if (title) metadataParts.push(`Video Title: ${title}`);
    if (description) metadataParts.push(`Video Description: ${description}`);
    const metadata =
      metadataParts.length > 0 ? `\n# CONTEXTUAL INFORMATION:\n${metadataParts.join("\n")}\n` : "";

    const sourceRule =
      kind === "youtube_url"
        ? "You are given the full video. Use BOTH spoken content and visuals (on-screen text/slides/charts/code/UI). Do not invent details that are not clearly supported by what you can see/hear."
        : "You are given a transcript only. Ground the summary ONLY in the transcript text and do not add visual-only details.";

    return [
      "Create a grounded, chronological summary.",
      metadata,
      languageInstruction,
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

  /**
   * Build LLM prompt for initial summary generation (no timestamps)
   */
  static getLlmSummaryPrompt(
    targetLanguage = "auto",
    title?: string,
    description?: string,
  ): string {
    const languageInstruction = getLanguageInstruction(targetLanguage);
    const metadataParts = [];
    if (title) metadataParts.push(`Video Title: ${title}`);
    if (description) metadataParts.push(`Video Description: ${description}`);
    const metadata =
      metadataParts.length > 0 ? `\n# CONTEXTUAL INFORMATION:\n${metadataParts.join("\n")}\n` : "";

    return [
      "Create a grounded, chronological summary.",
      metadata,
      languageInstruction,
      "",
      "Return JSON only with overview + chapters.",
      "- overview: string",
      "- chapters: array of { title: string, description: string }",
      "",
      "Rules:",
      "- Every claim must be supported by the transcript",
      "- Chapters must be chronological and non-overlapping",
      "- Avoid meta-language",
      "- Exclude sponsors/promos/calls to action",
    ].join("\n");
  }

  /**
   * Build prompt for quality assessment
   */
  static getQualityPrompt(): string {
    return [
      "Evaluate the summary JSON.",
      "Rate each aspect as 'Fail', 'Refine', or 'Pass' and include a specific reason.",
      "",
      "Expected shape:",
      "- overview: string",
      "- chapters: array of { title: string, description: string }",
    ].join("\n");
  }

  /**
   * Build LLM prompt for summary improvement (no timestamps)
   */
  static getLlmRefinePrompt(targetLanguage = "auto", title?: string, description?: string): string {
    const languageInstruction = getLanguageInstruction(targetLanguage, true);
    const metadataParts = [];
    if (title) metadataParts.push(`Video Title: ${title}`);
    if (description) metadataParts.push(`Video Description: ${description}`);
    const metadata =
      metadataParts.length > 0 ? `\n# CONTEXTUAL INFORMATION:\n${metadataParts.join("\n")}\n` : "";

    return [
      "Improve the summary based on quality feedback while staying transcript-grounded.",
      metadata,
      languageInstruction,
      "",
      "Return JSON only with overview + chapters.",
      "Rules: remove promos, avoid meta-language, keep chronology.",
    ].join("\n");
  }
}
