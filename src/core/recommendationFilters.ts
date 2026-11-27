/**
 * Recommendation-filter settings and the hidden-card and subscription records that the content script, side panel, and background worker exchange through storage.
 */

import { DEFAULTS, STORAGE_KEYS } from "./constants";
import { getStorageValues } from "./storage";

export interface FeedFilterSettings {
  viewsFilterEnabled: boolean;
  liveViewerFilterEnabled: boolean;
  mixFilterEnabled: boolean;
  membersOnlyFilterEnabled: boolean;
  podcastFilterEnabled: boolean;
  courseFilterEnabled: boolean;
  durationFilterEnabled: boolean;
  keywordFilterEnabled: boolean;
  ageFilterEnabled: boolean;
  englishOnlyTitles: boolean;
  preserveSubscribedChannels: boolean;
  minViews: number;
  minLiveViewers: number;
  minDuration: number;
  maxDuration: number;
  maxAgeYears: number;
  /** Members-only videos kept per channel whose membership you bought; the rest of that channel's are hidden when the members-only filter is on. */
  memberVideosPerChannel: number;
  keywords: string[];
}

export type FeedFilterToggleKey = {
  [K in keyof FeedFilterSettings]: FeedFilterSettings[K] extends boolean ? K : never;
}[keyof FeedFilterSettings];

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
  /** True for channels whose membership you bought; absent on subscriptions imported before memberships were recorded, which count as non-members until re-imported. */
  isMember?: boolean;
}

export interface StoredSubscriptions {
  extracted: string;
  channels: SubscriptionRecord[];
  channelNames: string[];
  count: number;
}

export const DEFAULT_FEED_FILTER_SETTINGS: FeedFilterSettings = {
  viewsFilterEnabled: DEFAULTS.VIEWS_FILTER_ENABLED,
  liveViewerFilterEnabled: DEFAULTS.LIVE_VIEWER_FILTER_ENABLED,
  mixFilterEnabled: DEFAULTS.MIX_FILTER_ENABLED,
  membersOnlyFilterEnabled: DEFAULTS.MEMBERS_ONLY_FILTER_ENABLED,
  podcastFilterEnabled: DEFAULTS.PODCAST_FILTER_ENABLED,
  courseFilterEnabled: DEFAULTS.COURSE_FILTER_ENABLED,
  durationFilterEnabled: DEFAULTS.DURATION_FILTER_ENABLED,
  keywordFilterEnabled: DEFAULTS.KEYWORD_FILTER_ENABLED,
  ageFilterEnabled: DEFAULTS.AGE_FILTER_ENABLED,
  englishOnlyTitles: DEFAULTS.ENGLISH_ONLY_TITLES,
  preserveSubscribedChannels: DEFAULTS.PRESERVE_SUBSCRIBED_CHANNELS,
  minViews: DEFAULTS.MIN_VIEWS,
  minLiveViewers: DEFAULTS.MIN_LIVE_VIEWERS,
  minDuration: DEFAULTS.MIN_DURATION,
  maxDuration: DEFAULTS.MAX_DURATION,
  maxAgeYears: DEFAULTS.MAX_AGE_YEARS,
  memberVideosPerChannel: DEFAULTS.MEMBER_VIDEOS_PER_CHANNEL,
  keywords: [...DEFAULTS.FILTER_KEYWORDS],
};

export const FEED_HIDE_FILTER_KEYS = [
  "viewsFilterEnabled",
  "liveViewerFilterEnabled",
  "mixFilterEnabled",
  "membersOnlyFilterEnabled",
  "podcastFilterEnabled",
  "courseFilterEnabled",
  "durationFilterEnabled",
  "keywordFilterEnabled",
  "ageFilterEnabled",
  "englishOnlyTitles",
] as const satisfies readonly (keyof FeedFilterSettings)[];

export const FEED_FILTER_STORAGE_KEYS: Record<keyof FeedFilterSettings, string> = {
  viewsFilterEnabled: STORAGE_KEYS.VIEWS_FILTER_ENABLED,
  liveViewerFilterEnabled: STORAGE_KEYS.LIVE_VIEWER_FILTER_ENABLED,
  mixFilterEnabled: STORAGE_KEYS.MIX_FILTER_ENABLED,
  membersOnlyFilterEnabled: STORAGE_KEYS.MEMBERS_ONLY_FILTER_ENABLED,
  podcastFilterEnabled: STORAGE_KEYS.PODCAST_FILTER_ENABLED,
  courseFilterEnabled: STORAGE_KEYS.COURSE_FILTER_ENABLED,
  durationFilterEnabled: STORAGE_KEYS.DURATION_FILTER_ENABLED,
  keywordFilterEnabled: STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
  ageFilterEnabled: STORAGE_KEYS.AGE_FILTER_ENABLED,
  englishOnlyTitles: STORAGE_KEYS.ENGLISH_ONLY_TITLES,
  preserveSubscribedChannels: STORAGE_KEYS.PRESERVE_SUBSCRIBED_CHANNELS,
  minViews: STORAGE_KEYS.MIN_VIEWS,
  minLiveViewers: STORAGE_KEYS.MIN_LIVE_VIEWERS,
  minDuration: STORAGE_KEYS.MIN_DURATION,
  maxDuration: STORAGE_KEYS.MAX_DURATION,
  maxAgeYears: STORAGE_KEYS.MAX_AGE_YEARS,
  memberVideosPerChannel: STORAGE_KEYS.MEMBER_VIDEOS_PER_CHANNEL,
  keywords: STORAGE_KEYS.FILTER_KEYWORDS,
};

export function hasActiveHideFilters(settings: FeedFilterSettings): boolean {
  return FEED_HIDE_FILTER_KEYS.some((key) => settings[key]);
}

export async function loadFeedFilterSettings(): Promise<FeedFilterSettings> {
  const result = await getStorageValues<Record<string, unknown>>(
    Object.values(FEED_FILTER_STORAGE_KEYS),
  );
  const stored = (key: keyof FeedFilterSettings) => result[FEED_FILTER_STORAGE_KEYS[key]];
  const toggle = (key: FeedFilterToggleKey) =>
    normalizeBoolean(stored(key), DEFAULT_FEED_FILTER_SETTINGS[key]);

  return {
    viewsFilterEnabled: toggle("viewsFilterEnabled"),
    liveViewerFilterEnabled: toggle("liveViewerFilterEnabled"),
    mixFilterEnabled: toggle("mixFilterEnabled"),
    membersOnlyFilterEnabled: toggle("membersOnlyFilterEnabled"),
    podcastFilterEnabled: toggle("podcastFilterEnabled"),
    courseFilterEnabled: toggle("courseFilterEnabled"),
    durationFilterEnabled: toggle("durationFilterEnabled"),
    keywordFilterEnabled: toggle("keywordFilterEnabled"),
    ageFilterEnabled: toggle("ageFilterEnabled"),
    englishOnlyTitles: toggle("englishOnlyTitles"),
    preserveSubscribedChannels: toggle("preserveSubscribedChannels"),
    minViews: normalizeNumber(stored("minViews"), DEFAULT_FEED_FILTER_SETTINGS.minViews),
    minLiveViewers: normalizeNumber(
      stored("minLiveViewers"),
      DEFAULT_FEED_FILTER_SETTINGS.minLiveViewers,
    ),
    minDuration: normalizeNumber(stored("minDuration"), DEFAULT_FEED_FILTER_SETTINGS.minDuration),
    maxDuration: normalizeNumber(stored("maxDuration"), DEFAULT_FEED_FILTER_SETTINGS.maxDuration),
    maxAgeYears: normalizeNumber(stored("maxAgeYears"), DEFAULT_FEED_FILTER_SETTINGS.maxAgeYears),
    memberVideosPerChannel: normalizeNumber(
      stored("memberVideosPerChannel"),
      DEFAULT_FEED_FILTER_SETTINGS.memberVideosPerChannel,
    ),
    keywords: normalizeKeywords(stored("keywords")),
  };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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
