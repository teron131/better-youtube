import { AnalysisSchema, QualitySchema } from "./schemas";
import type { z } from "zod";

const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  auto: "Use the same language as the transcript, or English if the transcript language is unclear",
  en: "English (US)",
  "zh-TW": "Traditional Chinese (繁體中文)",
};

/**
 * Convert Zod schema to string representation for LLM prompts
 */
function schemaToString(schema: z.ZodObject<any>): string {
  const lines: string[] = [];

  if (!schema._def?.shape) return "";

  const shape = schema._def.shape();
  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const fs = fieldSchema as z.ZodTypeAny;
    const type = getTypeString(fs);
    const description = (fs._def as any).description || "";
    const constraints = getConstraints(fs);

    let line = `${fieldName}: ${type}`;
    if (description) line += ` = ${description}`;
    if (constraints) line += ` ${constraints}`;

    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Get type string from Zod schema
 */
function getTypeString(zodSchema: z.ZodTypeAny): string {
  if (!zodSchema?._def) return "Any";

  const typeName = (zodSchema._def as any).typeName;

  if (typeName === "ZodString") return "str";
  if (typeName === "ZodNumber") return "float";
  if (typeName === "ZodBoolean") return "bool";
  if (typeName === "ZodObject") return "dict";

  if (typeName === "ZodArray") {
    const itemType = getTypeString((zodSchema._def as any).type);
    return `list[${itemType}]`;
  }

  if (typeName === "ZodEnum") {
    const values = (zodSchema._def as any).values.map((v: string) => `"${v}"`).join(", ");
    return `Literal[${values}]`;
  }

  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    return getTypeString((zodSchema._def as any).innerType);
  }

  return "Any";
}

/**
 * Get constraints string from Zod schema
 */
function getConstraints(zodSchema: z.ZodTypeAny): string {
  if (!zodSchema?._def) return "";

  const def = zodSchema._def as any;
  const constraints: string[] = [];

  if (def.typeName === "ZodArray") {
    if (def.minLength) constraints.push(`minItems=${def.minLength.value}`);
    if (def.maxLength) constraints.push(`maxItems=${def.maxLength.value}`);
  }

  if (def.typeName === "ZodString") {
    if (def.minLength) constraints.push(`minLength=${def.minLength.value}`);
    if (def.maxLength) constraints.push(`maxLength=${def.maxLength.value}`);
  }

  return constraints.length > 0 ? `(${constraints.join(", ")})` : "";
}

interface FieldInfo {
  description: string;
  type: string;
  min_length?: number;
  max_length?: number;
}

/**
 * Extract field information from Zod schema
 */
function extractFieldInfo(schema: z.ZodObject<any>): Record<string, FieldInfo> {
  const fieldsInfo: Record<string, FieldInfo> = {};

  if (!schema._def?.shape) return fieldsInfo;

  const shape = schema._def.shape();
  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const def = (fieldSchema as z.ZodTypeAny)._def as any;
    fieldsInfo[fieldName] = {
      description: def.description || "",
      type: def.typeName,
      min_length: def.typeName === "ZodArray" ? def.minLength?.value : undefined,
      max_length: def.typeName === "ZodArray" ? def.maxLength?.value : undefined,
    };
  }

  return fieldsInfo;
}

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
      : `Write ALL output (summary, takeaways, key_facts) in ${description}. Do not use English or any other language.`;

  return `${prefix}${instruction}${suffix}`;
}

/**
 * Build length summary for field requirements
 */
function buildLengthSummary(fieldsInfo: Record<string, FieldInfo>): string {
  const parts: string[] = [];

  for (const [fieldName, info] of Object.entries(fieldsInfo)) {
    const displayName = fieldName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const { min_length, max_length, description } = info;

    if (fieldName === "summary" && description.includes("150-400 words")) {
      parts.push("Summary (150-400 words)");
    } else if (min_length !== undefined && max_length !== undefined) {
      parts.push(`${displayName} (${min_length}-${max_length} items)`);
    }
  }

  return parts.join(", ");
}

/**
 * Build length guidelines for field requirements
 */
function buildLengthGuidelines(fieldsInfo: Record<string, FieldInfo>): string[] {
  const lines: string[] = [];

  for (const [fieldName, info] of Object.entries(fieldsInfo)) {
    const displayName = fieldName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const { min_length, max_length, description } = info;

    if (fieldName === "summary") {
      if (description.includes("150-400 words")) {
        lines.push("- Summary: 150-400 words");
      } else {
        lines.push("- Summary: As specified in description");
      }
    } else if (min_length !== undefined && max_length !== undefined) {
      lines.push(`- ${displayName}: ${min_length}-${max_length} items`);
    }
  }

  return lines;
}

/**
 * Build field requirements list
 */
function buildFieldRequirements(fieldsInfo: Record<string, FieldInfo>): string[] {
  const requirements: string[] = [];

  for (const [fieldName, info] of Object.entries(fieldsInfo)) {
    if (!info.description) continue;

    const displayName = fieldName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    let requirement = `- ${displayName}: ${info.description}`;

    const { min_length, max_length } = info;
    if (min_length !== undefined && max_length !== undefined) {
      requirement += ` (${min_length}-${max_length} items)`;
    }

    requirements.push(requirement);
  }

  return requirements;
}

export class PromptBuilder {
  static LANGUAGE_DESCRIPTIONS = LANGUAGE_DESCRIPTIONS;

  /**
   * Build prompt for initial analysis generation
   */
  static buildAnalysisPrompt(targetLanguage = "auto"): string {
    const schema = schemaToString(AnalysisSchema);
    const fieldsInfo = extractFieldInfo(AnalysisSchema);
    const fieldRequirements = buildFieldRequirements(fieldsInfo);
    const languageInstruction = getLanguageInstruction(targetLanguage);

    return [
      "Create a comprehensive analysis that strictly follows the transcript content.",
      "",
      languageInstruction,
      "",
      "OUTPUT SCHEMA:",
      schema,
      "",
      "FIELD REQUIREMENTS:",
      ...fieldRequirements,
      "",
      "CORE REQUIREMENTS:",
      "- ACCURACY: Every claim must be directly supported by the transcript",
      "- TONE: Write in objective, article-like style (avoid 'This video...', 'The speaker...')",
      "- AVOID META-DESCRIPTIVE LANGUAGE: Do not use phrases like 'This analysis explores', etc. Write direct, factual content only",
      languageInstruction,
      "",
      "CONTENT FILTERING:",
      "- Remove all promotional content (speaker intros, calls-to-action, self-promotion)",
      "- Keep only educational content",
      "- Correct obvious typos naturally",
      "",
      "QUALITY CHECKS:",
      "- Content matches transcript exactly (no external additions)",
      "- All promotional content removed",
      "- Typos corrected naturally, meaning preserved",
      `- Length balanced: ${buildLengthSummary(fieldsInfo)}`,
    ].join("\n");
  }

  /**
   * Build prompt for quality assessment - updated with 6 aspects
   */
  static buildQualityPrompt(): string {
    const schema = schemaToString(QualitySchema);
    const fieldsInfo = extractFieldInfo(QualitySchema);
    const analysisFields = extractFieldInfo(AnalysisSchema);
    const lengthLines = buildLengthGuidelines(analysisFields);

    const aspects: string[] = [];
    let idx = 1;
    for (const [fieldName, info] of Object.entries(fieldsInfo)) {
      const aspectName = fieldName.toUpperCase().replace(/_/g, " ");
      const description = info.description.includes(":")
        ? info.description.split(":", 2)[1].trim()
        : info.description;
      aspects.push(`${idx}. ${aspectName}: ${description}`);
      idx++;
    }

    return [
      "Evaluate the analysis on the following aspects. Rate each 'Fail', 'Refine', or 'Pass' with a specific reason.",
      "",
      "ASPECTS:",
      ...aspects,
      "",
      "LENGTH GUIDELINES:",
      ...lengthLines,
      "",
      "QUALITY STANDARDS:",
      "- Transcript-based content only",
      "- Professional article-like tone",
      "- No meta-descriptive language",
      "",
      "Provide specific rates and reasons for each aspect.",
      "",
      "OUTPUT SCHEMA:",
      schema,
    ].join("\n");
  }

  /**
   * Build prompt for analysis improvement
   */
  static buildImprovementPrompt(): string {
    const schema = schemaToString(AnalysisSchema);
    const fieldsInfo = extractFieldInfo(AnalysisSchema);
    const fieldRequirements = buildFieldRequirements(fieldsInfo);

    return [
      "Improve the analysis based on quality feedback while maintaining transcript accuracy.",
      "",
      "IMPROVEMENT PRIORITIES:",
      "1. TRANSCRIPT ACCURACY: All content must be transcript-supported",
      "2. PROMOTIONAL REMOVAL: Remove all intros, calls-to-action, self-promotion",
      "3. WRITING STYLE: Use objective, article-like tone",
      "4. AVOID META-DESCRIPTIVE LANGUAGE: Remove phrases like 'This analysis explores', etc.",
      "5. TYPO CORRECTION: Fix obvious typos naturally",
      "6. ARRAY FORMATTING: Return takeaways/key_facts as simple string arrays",
      "",
      "CONTENT TARGETS:",
      ...fieldRequirements,
      "",
      "OUTPUT SCHEMA:",
      schema,
    ].join("\n");
  }

  /**
   * Get language instruction (exposed for external use)
   */
  static _getLanguageInstruction(targetLanguage: string, isRefinement = false): string {
    return getLanguageInstruction(targetLanguage, isRefinement);
  }
}
