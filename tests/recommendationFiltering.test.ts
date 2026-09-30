import assert from "node:assert/strict";
import test from "node:test";

import {
  extractVideoData,
  type VideoCardData,
} from "../src/content/recommendationFilterExtractor.ts";
import { getTriggeredFilter } from "../src/content/recommendationFilterPolicy.ts";
import type { FeedFilterSettings } from "../src/core/recommendationFilters.ts";

const DEFAULT_SETTINGS: FeedFilterSettings = {
  viewsFilterEnabled: false,
  liveViewerFilterEnabled: false,
  mixFilterEnabled: false,
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
    isGeneratedMix: false,
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

test("extracts compact lockup views and age using their accessibility labels", () => {
  const metadata = [
    { textContent: "Jeff Su", getAttribute: () => null },
    { textContent: "3.8M", getAttribute: () => "3.8 million views" },
    { textContent: "2y ago", getAttribute: () => "2 years ago" },
  ];
  const card = {
    tagName: "YT-LOCKUP-VIEW-MODEL",
    textContent: "Example video Jeff Su 3.8M 2y ago",
    innerText: "Example video\nJeff Su\n3.8M\n2y ago",
    querySelector: (selector: string) =>
      selector === "h3[title]" ? { textContent: "Example video" } : null,
    querySelectorAll: (selector: string) =>
      selector === "yt-content-metadata-view-model [aria-label]" ? metadata : [],
  } as unknown as Element;

  const extracted = extractVideoData(card);
  assert.equal(extracted.viewCount, "3.8M");
  assert.equal(extracted.publishTime, "2 years ago");
  assert.deepEqual(
    getTriggeredFilter(extracted, settings({ viewsFilterEnabled: true, minViews: 4_000_000 })),
    { shouldFilter: true, reason: "views", details: "Low views: 3.8M (3800000)" },
  );
  assert.equal(
    getTriggeredFilter(extracted, settings({ viewsFilterEnabled: true, minViews: 1_000_000 }))
      .shouldFilter,
    false,
  );
  assert.equal(
    getTriggeredFilter(extracted, settings({ ageFilterEnabled: true, maxAgeYears: 1 }))
      .shouldFilter,
    true,
  );
});

test("extracts bare search-result views and abbreviated age without renderer data", () => {
  const metadata = [{ textContent: "35K" }, { textContent: "22h ago" }];
  const card = {
    tagName: "YTD-VIDEO-RENDERER",
    textContent: "Example video 35K 22h ago",
    querySelector: (selector: string) => {
      if (selector === "#video-title") return { textContent: "Example video" };
      if (selector === "#metadata-line") return { textContent: "35K 22h ago" };
      return null;
    },
    querySelectorAll: (selector: string) =>
      selector === "#metadata-line .inline-metadata-item" ? metadata : [],
  } as unknown as Element;

  const extracted = extractVideoData(card);
  assert.equal(extracted.viewCount, "35K");
  assert.equal(extracted.publishTime, "22h ago");
  assert.equal(
    getTriggeredFilter(extracted, settings({ viewsFilterEnabled: true, minViews: 50_000 }))
      .shouldFilter,
    true,
  );
  assert.equal(
    getTriggeredFilter(
      { ...extracted, publishTime: "2y ago" },
      settings({ ageFilterEnabled: true, maxAgeYears: 1 }),
    ).shouldFilter,
    true,
  );
});

test("does not filter generated YouTube Mix cards when mix filter is disabled", () => {
  const result = getTriggeredFilter(
    videoData({
      title: "Mix - THE SCOTTS, Travis Scott, Kid Cudi - THE SCOTTS",
      isGeneratedMix: true,
    }),
    settings({}),
  );

  assert.equal(result.shouldFilter, false);
});

test("filters generated YouTube Mix cards when mix filter is enabled", () => {
  const result = getTriggeredFilter(
    videoData({
      title: "Mix - THE SCOTTS, Travis Scott, Kid Cudi - THE SCOTTS",
      isGeneratedMix: true,
    }),
    settings({ mixFilterEnabled: true }),
  );

  assert.equal(result.shouldFilter, true);
  if (result.shouldFilter) {
    assert.equal(result.reason, "mix");
  }
});
