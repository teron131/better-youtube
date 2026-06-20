import { STORAGE_KEYS } from "@/core/constants";
import type { FeedFilterSettings } from "@/core/recommendationFilters";

export const RECOMMENDATION_FILTER_TOGGLE_KEYS = [
	"viewsFilterEnabled",
	"durationFilterEnabled",
	"keywordFilterEnabled",
	"ageFilterEnabled",
	"englishOnlyTitles",
] as const;

export const RECOMMENDATION_FILTER_STORAGE_KEYS = new Set<string>([
	STORAGE_KEYS.VIEWS_FILTER_ENABLED,
	STORAGE_KEYS.DURATION_FILTER_ENABLED,
	STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
	STORAGE_KEYS.AGE_FILTER_ENABLED,
	STORAGE_KEYS.ENGLISH_ONLY_TITLES,
]);

export function hasActiveRecommendationFilters(
	settings: FeedFilterSettings,
): boolean {
	return RECOMMENDATION_FILTER_TOGGLE_KEYS.some((key) => settings[key]);
}
