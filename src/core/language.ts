/** What Target language values and typed language names mean to model prompts, and which caption rewrite to preselect. */

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  "zh-TW": "Traditional Chinese (繁體中文)",
};

/** The name a prompt uses for a setting value; anything else, such as a typed "Japanese", reaches the model as written. */
export function describeLanguage(language: string): string {
  return LANGUAGE_NAMES[language] ?? language;
}

/**
 * The translation to preselect for a track, or null to preselect refining.
 * A source marked `translationRequired` stands in for YouTube's failed English translation, so it always becomes English.
 * Otherwise the Target language applies unless it is `auto` or shares the captions' primary subtag, so `zh-TW` only refines `zh-Hans` captions.
 */
export function preferredRewriteLanguage(
  captionLanguage: string,
  translationRequired: boolean,
  targetLanguage: string,
): string | null {
  if (translationRequired) return "en";
  return targetLanguage === "auto" || isSameLanguage(targetLanguage, captionLanguage)
    ? null
    : targetLanguage;
}

/** True for a translation into the captions' own language, such as `en` for `en-US` captions, which refining already covers. */
export function isSameLanguage(language: string, captionLanguage: string): boolean {
  return baseLanguage(language) === baseLanguage(captionLanguage);
}

function baseLanguage(language: string): string {
  return language.split("-")[0].toLowerCase();
}
