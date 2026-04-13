/**
 * Sidepanel helpers for recommendation filtering settings and actions.
 */

import { MESSAGE_ACTIONS, STORAGE_KEYS } from "@/core/constants";
import {
	type FeedFilterSettings,
	type FilterStats,
	type FilteredVideoRecord,
	type StoredSubscriptions,
	FEED_FILTER_STORAGE_KEYS,
	getFilterStats,
	loadFeedFilterSettings,
} from "@/core/recommendationFilters";
import { getStorageValue, setStorageValue } from "@/core/storage";
import { getCurrentTab, sendChromeMessage } from "@/core/utils/chrome";

export async function getRecommendationFilterSettings(): Promise<FeedFilterSettings> {
	return loadFeedFilterSettings();
}

export async function setRecommendationFilterSetting<
	K extends keyof FeedFilterSettings,
>(
	key: K,
	value: FeedFilterSettings[K],
): Promise<void> {
	await setStorageValue(FEED_FILTER_STORAGE_KEYS[key], value);
}

export async function getRecommendationFilterStats(): Promise<FilterStats> {
	return getFilterStats();
}

export async function getRecommendationFilterHistory(): Promise<
	FilteredVideoRecord[]
> {
	return (
		(await getStorageValue<FilteredVideoRecord[]>(STORAGE_KEYS.FILTERED_VIDEOS)) ||
		[]
	);
}

export async function clearRecommendationFilterHistory(): Promise<void> {
	await setStorageValue(STORAGE_KEYS.FILTERED_VIDEOS, []);
}

export async function getStoredSubscriptions(): Promise<StoredSubscriptions | null> {
	return getStorageValue<StoredSubscriptions>(STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS);
}

export async function openSubscriptionsPage(): Promise<void> {
	await chrome.tabs.create({ url: "https://www.youtube.com/feed/channels" });
}

export async function extractSubscriptionsFromCurrentTab(): Promise<{
	count: number;
}> {
	const activeTab = await getCurrentTab();
	if (!activeTab?.id || !activeTab.url) {
		throw new Error("Open the YouTube subscriptions page in the active tab first.");
	}

	if (!activeTab.url.includes("youtube.com/feed/channels")) {
		throw new Error("Navigate the active tab to YouTube subscriptions first.");
	}

	const response = await sendChromeMessage<{
		success: boolean;
		count?: number;
		error?: string;
	}>({
		action: MESSAGE_ACTIONS.EXTRACT_SUBSCRIPTIONS,
		tabId: activeTab.id,
	});

	if (!response.success) {
		throw new Error(response.error || "Failed to extract subscriptions.");
	}

	return { count: response.count || 0 };
}
