
const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  auto: "Use the same language as the transcript, or English if the transcript language is unclear",
  en: "English (US)",
  "zh-TW": "Traditional Chinese (繁體中文)",
};

/**
 * Get language instruction for prompts
 */
function getLanguageInstruction(targetLanguage: string, isRefinement = false): string {
  const prefix = isRefinement
    ? "\n\nOUTPUT LANGUAGE (REQUIRED): "
    : "- OUTPUT LANGUAGE (REQUIRED): ";
  const suffix = isRefinement ? " All text must be in this language." : "";

  const description = LANGUAGE_DESCRIPTIONS[targetLanguage] || targetLanguage;
  const instruction =
    targetLanguage === "auto"
      ? description
      : `Write ALL output in ${description}. Do not use English or any other language.`;

  return `${prefix}${instruction}${suffix}`;
}

export class PromptBuilder {
  static LANGUAGE_DESCRIPTIONS = LANGUAGE_DESCRIPTIONS;

  /**
   * Build prompt for initial analysis generation
   */
  static buildAnalysisPrompt(targetLanguage = "auto"): string {
    const languageInstruction = getLanguageInstruction(targetLanguage);

    return [
      "Create a comprehensive analysis that strictly follows the transcript content.",
      "",
      languageInstruction,
      "",
      "REQUIREMENTS:",
      "- Every claim must be directly supported by the transcript",
      "- Write in objective, article-like style (avoid 'This video...', 'The speaker...')",
      "- No meta-descriptive language ('This analysis explores', etc.)",
      "- Remove promotional content (speaker intros, calls-to-action)",
      "- Keep only educational content",
    ].join("\n");
  }

  /**
   * Build prompt for quality assessment
   */
  static buildQualityPrompt(): string {
    return [
      "Evaluate the analysis. Rate each aspect 'Fail', 'Refine', or 'Pass' with a specific reason.",
    ].join("\n");
  }

  /**
   * Build prompt for analysis improvement
   */
  static buildImprovementPrompt(targetLanguage = "auto"): string {
    const languageInstruction = getLanguageInstruction(targetLanguage, true);

    return [
      "Improve the analysis based on quality feedback while maintaining transcript accuracy.",
      "",
      languageInstruction,
      "",
      "PRIORITIES:",
      "- All content must be transcript-supported",
      "- Remove promotional content",
      "- Use objective, article-like tone",
      "- No meta-descriptive language",
    ].join("\n");
  }

  /**
   * Get language instruction (exposed for external use)
   */
  static _getLanguageInstruction(targetLanguage: string, isRefinement = false): string {
    return getLanguageInstruction(targetLanguage, isRefinement);
  }
}
