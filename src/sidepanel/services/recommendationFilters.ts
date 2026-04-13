/**
 * Sidepanel helpers for recommendation filtering settings and actions.
 */

import { MESSAGE_ACTIONS, STORAGE_KEYS } from "@/core/constants";
import {
	FEED_FILTER_STORAGE_KEYS,
	type FeedFilterSettings,
	type FilteredVideoRecord,
	type FilterStats,
	getFilterStats,
	loadFeedFilterSettings,
	type StoredSubscriptions,
} from "@/core/recommendationFilters";
import { getStorageValue, setStorageValue } from "@/core/storage";
import { getCurrentTab, sendChromeMessage } from "@/core/utils/chrome";

const SUBSCRIPTIONS_PAGE_URL = "https://www.youtube.com/feed/channels";
const TAB_LOAD_TIMEOUT_MS = 30000;

export async function getRecommendationFilterSettings(): Promise<FeedFilterSettings> {
	return loadFeedFilterSettings();
}

export async function setRecommendationFilterSetting<
	K extends keyof FeedFilterSettings,
>(key: K, value: FeedFilterSettings[K]): Promise<void> {
	await setStorageValue(FEED_FILTER_STORAGE_KEYS[key], value);
}

export async function getRecommendationFilterStats(): Promise<FilterStats> {
	return getFilterStats();
}

export async function getRecommendationFilterHistory(): Promise<
	FilteredVideoRecord[]
> {
	return (
		(await getStorageValue<FilteredVideoRecord[]>(
			STORAGE_KEYS.FILTERED_VIDEOS,
		)) || []
	);
}

export async function clearRecommendationFilterHistory(): Promise<void> {
	await setStorageValue(STORAGE_KEYS.FILTERED_VIDEOS, []);
}

export async function getStoredSubscriptions(): Promise<StoredSubscriptions | null> {
	return getStorageValue<StoredSubscriptions>(
		STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS,
	);
}

export async function extractSubscriptionsFromCurrentTab(): Promise<{
	count: number;
}> {
	const activeTab = await getCurrentTab();

	if (activeTab?.id && activeTab.url?.includes("youtube.com/feed/channels")) {
		return extractSubscriptionsFromTab(activeTab.id);
	}

	const subscriptionsTab = await chrome.tabs.create({
		url: SUBSCRIPTIONS_PAGE_URL,
	});
	if (!subscriptionsTab.id) {
		throw new Error("Failed to open the YouTube subscriptions page.");
	}

	await waitForTabToFinishLoading(subscriptionsTab.id);
	return extractSubscriptionsFromTab(subscriptionsTab.id);
}

async function extractSubscriptionsFromTab(tabId: number): Promise<{
	count: number;
}> {
	const response = await sendChromeMessage<{
		success: boolean;
		count?: number;
		error?: string;
	}>({
		action: MESSAGE_ACTIONS.EXTRACT_SUBSCRIPTIONS,
		tabId,
	});

	if (!response.success) {
		throw new Error(response.error || "Failed to extract subscriptions.");
	}

	return { count: response.count || 0 };
}

async function waitForTabToFinishLoading(tabId: number): Promise<void> {
	const currentTab = await chrome.tabs.get(tabId);
	if (currentTab.status === "complete") {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			chrome.tabs.onUpdated.removeListener(listener);
			reject(
				new Error("Timed out while opening the YouTube subscriptions page."),
			);
		}, TAB_LOAD_TIMEOUT_MS);

		const listener = (
			updatedTabId: number,
			changeInfo: chrome.tabs.TabChangeInfo,
		) => {
			if (updatedTabId !== tabId || changeInfo.status !== "complete") {
				return;
			}

			window.clearTimeout(timeoutId);
			chrome.tabs.onUpdated.removeListener(listener);
			resolve();
		};

		chrome.tabs.onUpdated.addListener(listener);
	});
}
