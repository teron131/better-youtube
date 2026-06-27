import assert from "node:assert/strict";
import test from "node:test";

import type { FeedFilterSettings } from "../src/core/recommendationFilters.ts";
import type { VideoCardData } from "../src/content/recommendationFilterExtractor.ts";
import { getTriggeredFilter } from "../src/content/recommendationFilterPolicy.ts";

const DEFAULT_SETTINGS: FeedFilterSettings = {
	viewsFilterEnabled: false,
	liveViewerFilterEnabled: false,
	durationFilterEnabled: false,
	keywordFilterEnabled: false,
	ageFilterEnabled: false,
	englishOnlyTitles: false,
	preserveSubscribedChannels: true,
	minViews: 10000,
	minLiveViewers: 1000,
	minDuration: 0,
	maxDuration: 3600,
	maxAgeYears: 10,
	keywords: [],
};

function settings(overrides: Partial<FeedFilterSettings>): FeedFilterSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
	};
}

function videoData(overrides: Partial<VideoCardData>): VideoCardData {
	return {
		title: "Example video",
		titleLanguage: "en",
		viewCount: null,
		duration: null,
		publishTime: null,
		isLiveContent: false,
		isActiveLiveContent: false,
		videoId: "video-id",
		channelName: "Example channel",
		channelLanguage: "en",
		channelId: "UC123",
		channelPath: "/@example",
		...overrides,
	};
}

test("filters active live streams by current viewer count", () => {
	const result = getTriggeredFilter(
		videoData({
			viewCount: "6 watching",
			isLiveContent: true,
			isActiveLiveContent: true,
		}),
		settings({
			liveViewerFilterEnabled: true,
			minLiveViewers: 1000,
		}),
	);

	assert.equal(result.shouldFilter, true);
	if (result.shouldFilter) {
		assert.equal(result.reason, "live-viewers");
		assert.match(result.details, /Low live viewers/);
	}
});

test("waits for active live stream cards when viewer count is not comparable yet", () => {
	const result = getTriggeredFilter(
		videoData({
			viewCount: null,
			isLiveContent: true,
			isActiveLiveContent: true,
		}),
		settings({
			liveViewerFilterEnabled: true,
			minLiveViewers: 1000,
		}),
	);

	assert.equal(result.shouldFilter, false);
});

test("does not filter active live streams with the normal low views filter", () => {
	const result = getTriggeredFilter(
		videoData({
			viewCount: "6 watching",
			isLiveContent: true,
			isActiveLiveContent: true,
		}),
		settings({ viewsFilterEnabled: true, minViews: 10_000 }),
	);

	assert.equal(result.shouldFilter, false);
});

test("does not filter active live streams by missing duration", () => {
	const result = getTriggeredFilter(
		videoData({
			duration: null,
			isLiveContent: true,
			isActiveLiveContent: true,
		}),
		settings({ durationFilterEnabled: true, maxDuration: 1_800 }),
	);

	assert.equal(result.shouldFilter, false);
});

test("does not filter finished streams when duration is not comparable yet", () => {
	const result = getTriggeredFilter(
		videoData({
			duration: null,
			publishTime: "Streamed 2 days ago",
			isLiveContent: true,
			isActiveLiveContent: false,
		}),
		settings({ durationFilterEnabled: true, maxDuration: 1_800 }),
	);

	assert.equal(result.shouldFilter, false);
});

test("filters finished streams by duration when duration metadata is available", () => {
	const result = getTriggeredFilter(
		videoData({
			duration: "4:00:00",
			publishTime: "Streamed 2 days ago",
			isLiveContent: true,
		}),
		settings({
			durationFilterEnabled: true,
			maxDuration: 1_800,
		}),
	);

	assert.equal(result.shouldFilter, true);
	if (result.shouldFilter) {
		assert.equal(result.reason, "duration");
	}
});

test("does not hide ordinary videos only because view metadata is missing", () => {
	const result = getTriggeredFilter(
		videoData({ viewCount: null }),
		settings({ viewsFilterEnabled: true, minViews: 10_000 }),
	);

	assert.equal(result.shouldFilter, false);
});
