/**
 * Shared recommendation-filter configuration and data contracts.
 */

import { DEFAULTS, STORAGE_KEYS } from "./constants";
import { getStorageValue, getStorageValues } from "./storage";

export interface FeedFilterSettings {
	viewsFilterEnabled: boolean;
	durationFilterEnabled: boolean;
	keywordFilterEnabled: boolean;
	ageFilterEnabled: boolean;
	englishOnlyTitles: boolean;
	preserveSubscribedChannels: boolean;
	minViews: number;
	minDuration: number;
	maxDuration: number;
	maxAgeYears: number;
	keywords: string[];
}

export interface FilterStats {
	views: number;
	keywords: number;
	duration: number;
	age: number;
	language: number;
	total: number;
}

export interface FilteredVideoRecord {
	key?: string;
	title: string;
	reason: string;
	timestamp: string;
}

export interface SubscriptionRecord {
	name: string | null;
	channelId: string | null;
	channelPath: string | null;
	channelUrl?: string | null;
	handle?: string | null;
	description?: string | null;
}

export interface StoredSubscriptions {
	extracted: string;
	channels: SubscriptionRecord[];
	channelNames: string[];
	count: number;
}

export const DEFAULT_FILTER_STATS: FilterStats = {
	views: 0,
	keywords: 0,
	duration: 0,
	age: 0,
	language: 0,
	total: 0,
};

export const DEFAULT_FEED_FILTER_SETTINGS: FeedFilterSettings = {
	viewsFilterEnabled: DEFAULTS.VIEWS_FILTER_ENABLED,
	durationFilterEnabled: DEFAULTS.DURATION_FILTER_ENABLED,
	keywordFilterEnabled: DEFAULTS.KEYWORD_FILTER_ENABLED,
	ageFilterEnabled: DEFAULTS.AGE_FILTER_ENABLED,
	englishOnlyTitles: DEFAULTS.ENGLISH_ONLY_TITLES,
	preserveSubscribedChannels: DEFAULTS.PRESERVE_SUBSCRIBED_CHANNELS,
	minViews: DEFAULTS.MIN_VIEWS,
	minDuration: DEFAULTS.MIN_DURATION,
	maxDuration: DEFAULTS.MAX_DURATION,
	maxAgeYears: DEFAULTS.MAX_AGE_YEARS,
	keywords: [...DEFAULTS.FILTER_KEYWORDS],
};

export const FEED_FILTER_STORAGE_KEYS: Record<
	keyof FeedFilterSettings,
	string
> = {
	viewsFilterEnabled: STORAGE_KEYS.VIEWS_FILTER_ENABLED,
	durationFilterEnabled: STORAGE_KEYS.DURATION_FILTER_ENABLED,
	keywordFilterEnabled: STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
	ageFilterEnabled: STORAGE_KEYS.AGE_FILTER_ENABLED,
	englishOnlyTitles: STORAGE_KEYS.ENGLISH_ONLY_TITLES,
	preserveSubscribedChannels: STORAGE_KEYS.PRESERVE_SUBSCRIBED_CHANNELS,
	minViews: STORAGE_KEYS.MIN_VIEWS,
	minDuration: STORAGE_KEYS.MIN_DURATION,
	maxDuration: STORAGE_KEYS.MAX_DURATION,
	maxAgeYears: STORAGE_KEYS.MAX_AGE_YEARS,
	keywords: STORAGE_KEYS.FILTER_KEYWORDS,
};

export async function loadFeedFilterSettings(): Promise<FeedFilterSettings> {
	const result = await getStorageValues<Record<string, unknown>>(
		Object.values(FEED_FILTER_STORAGE_KEYS),
	);

	return {
		viewsFilterEnabled:
			(result[STORAGE_KEYS.VIEWS_FILTER_ENABLED] as boolean | undefined) ??
			DEFAULT_FEED_FILTER_SETTINGS.viewsFilterEnabled,
		durationFilterEnabled:
			(result[STORAGE_KEYS.DURATION_FILTER_ENABLED] as boolean | undefined) ??
			DEFAULT_FEED_FILTER_SETTINGS.durationFilterEnabled,
		keywordFilterEnabled:
			(result[STORAGE_KEYS.KEYWORD_FILTER_ENABLED] as boolean | undefined) ??
			DEFAULT_FEED_FILTER_SETTINGS.keywordFilterEnabled,
		ageFilterEnabled:
			(result[STORAGE_KEYS.AGE_FILTER_ENABLED] as boolean | undefined) ??
			DEFAULT_FEED_FILTER_SETTINGS.ageFilterEnabled,
		englishOnlyTitles:
			(result[STORAGE_KEYS.ENGLISH_ONLY_TITLES] as boolean | undefined) ??
			DEFAULT_FEED_FILTER_SETTINGS.englishOnlyTitles,
		preserveSubscribedChannels:
			(result[STORAGE_KEYS.PRESERVE_SUBSCRIBED_CHANNELS] as
				| boolean
				| undefined) ?? DEFAULT_FEED_FILTER_SETTINGS.preserveSubscribedChannels,
		minViews: normalizeNumber(
			result[STORAGE_KEYS.MIN_VIEWS],
			DEFAULT_FEED_FILTER_SETTINGS.minViews,
		),
		minDuration: normalizeNumber(
			result[STORAGE_KEYS.MIN_DURATION],
			DEFAULT_FEED_FILTER_SETTINGS.minDuration,
		),
		maxDuration: normalizeNumber(
			result[STORAGE_KEYS.MAX_DURATION],
			DEFAULT_FEED_FILTER_SETTINGS.maxDuration,
		),
		maxAgeYears: normalizeNumber(
			result[STORAGE_KEYS.MAX_AGE_YEARS],
			DEFAULT_FEED_FILTER_SETTINGS.maxAgeYears,
		),
		keywords: normalizeKeywords(result[STORAGE_KEYS.FILTER_KEYWORDS]),
	};
}

export async function getFilterStats(): Promise<FilterStats> {
	const storedStats = await getStorageValue<Partial<FilterStats>>(
		STORAGE_KEYS.FILTER_STATS,
	);

	return {
		...DEFAULT_FILTER_STATS,
		...(storedStats ?? {}),
	};
}

function normalizeNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeKeywords(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [...DEFAULT_FEED_FILTER_SETTINGS.keywords];
	}

	return value
		.filter((keyword): keyword is string => typeof keyword === "string")
		.map((keyword) => keyword.trim().toLowerCase())
		.filter(Boolean);
}
