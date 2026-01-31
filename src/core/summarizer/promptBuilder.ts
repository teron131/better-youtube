const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  auto: "Use the same language as the transcript, or English if the transcript language is unclear",
  en: "English (US)",
  "zh-TW": "Traditional Chinese (繁體中文)",
};

/**
 * Get language instruction for prompts
 */
function getLanguageInstruction(
  targetLanguage: string,
  isRefinement = false,
): string {
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
  static LANGUAGE_DESCRIPTIONS = LANGUAGE_DESCRIPTIONS;

  /**
   * Build prompt for initial summary generation
   */
  static buildSummaryPrompt(
    targetLanguage = "auto",
    title?: string,
    description?: string,
  ): string {
    const languageInstruction = getLanguageInstruction(targetLanguage);
    const metadataParts = [];
    if (title) metadataParts.push(`Video Title: ${title}`);
    if (description) metadataParts.push(`Video Description: ${description}`);
    const metadata =
      metadataParts.length > 0
        ? `\n# CONTEXTUAL INFORMATION:\n${metadataParts.join("\n")}\n`
        : "";

    return [
      "Create a transcript-grounded summary.",
      metadata,
      languageInstruction,
      "",
      "OUTPUT FORMAT (STRICT):",
      "- Return JSON matching the required schema ONLY.",
      "- Top-level fields:",
      "  - overview (string)",
      "  - chapters (array)",
      "- Each chapter:",
      "  - title (string)",
      "  - description (string)",
      "  - startTime/endTime are optional (MM:SS) and may be omitted.",
      "",
      "REQUIREMENTS:",
      "- Every claim must be directly supported by the transcript",
      "- Chapters must be chronological and non-overlapping; merge adjacent topics when needed",
      "- Write in objective, article-like style (avoid 'This video...', 'The speaker...')",
      "- No meta-descriptive language ('This summary explores', etc.)",
      "- Remove promotional content (intros/outros/calls-to-action/sponsors)",
      "- Keep only educational content",
    ].join("\n");
  }

  /**
   * Build prompt for quality assessment
   */
  static buildQualityPrompt(): string {
    return [
      "Evaluate the summary JSON.",
      "Rate each aspect as 'Fail', 'Refine', or 'Pass' and include a specific reason.",
      "",
      "EXPECTED SUMMARY SCHEMA:",
      "- overview: string",
      "- chapters: array of { title: string, description: string, startTime?: string, endTime?: string }",
      "",
      "ASPECT GUIDELINES:",
      "- completeness: covers the full transcript end-to-end",
      "- structure: schema is followed; chapters are chronological and substantive",
      "- no_garbage: no sponsorships/promos/filler",
      "- meta_language_avoidance: no 'this video...' style framing",
      "- correct_language: matches requested target language",
    ].join("\n");
  }

  /**
   * Build prompt for summary improvement
   */
  static buildImprovementPrompt(
    targetLanguage = "auto",
    title?: string,
    description?: string,
  ): string {
    const languageInstruction = getLanguageInstruction(targetLanguage, true);
    const metadataParts = [];
    if (title) metadataParts.push(`Video Title: ${title}`);
    if (description) metadataParts.push(`Video Description: ${description}`);
    const metadata =
      metadataParts.length > 0
        ? `\n# CONTEXTUAL INFORMATION:\n${metadataParts.join("\n")}\n`
        : "";

    return [
      "Improve the summary based on quality feedback while maintaining transcript accuracy.",
      metadata,
      languageInstruction,
      "",
      "OUTPUT FORMAT (STRICT):",
      "- Keep the same schema: { overview, chapters[] } only.",
      "",
      "PRIORITIES:",
      "- All content must be transcript-supported",
      "- Remove promotional content",
      "- Use objective, article-like tone",
      "- No meta-descriptive language",
      "- Improve structure by merging/splitting chapters (chronological, non-overlapping)",
    ].join("\n");
  }

  /**
   * Get language instruction (exposed for external use)
   */
  static _getLanguageInstruction(
    targetLanguage: string,
    isRefinement = false,
  ): string {
    return getLanguageInstruction(targetLanguage, isRefinement);
  }
}
