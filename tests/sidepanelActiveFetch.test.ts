import assert from "node:assert/strict";
import test from "node:test";

import { MESSAGE_ACTIONS, TIMING } from "../src/core/constants.ts";
import { fetchCurrentVideoState } from "../src/sidepanel/lib/current-video.ts";

test("fetches current video state through the active tab scrape route", async () => {
  const sentMessages: unknown[] = [];
  const messageTimeouts: Array<number | undefined> = [];
  const state = await fetchCurrentVideoState("abc123XYZ_9", {
    getCurrentTab: async () =>
      ({
        id: 42,
      }) as chrome.tabs.Tab,
    sendMessage: async (message, timeout) => {
      sentMessages.push(message);
      messageTimeouts.push(timeout);
      return {
        status: "success",
        videoInfo: {
          url: "https://www.youtube.com/watch?v=abc123XYZ_9",
          title: "Fresh title",
          thumbnail: "https://img.youtube.com/vi/abc123XYZ_9/hqdefault.jpg",
          author: "Fresh channel",
        },
        transcript: "fresh transcript",
      };
    },
  });

  assert.deepEqual(sentMessages, [
    {
      action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
      videoId: "abc123XYZ_9",
      tabId: 42,
      suppressErrors: true,
    },
  ]);
  assert.deepEqual(messageTimeouts, [TIMING.SCRAPING_TIMEOUT_MS]);
  assert.equal(state?.videoInfo?.title, "Fresh title");
  assert.equal(state?.transcript, "fresh transcript");
});

test("ignores skipped active video scrape responses", async () => {
  const state = await fetchCurrentVideoState("abc123XYZ_9", {
    getCurrentTab: async () => null,
    sendMessage: async () => ({
      status: "skipped",
    }),
  });

  assert.equal(state, null);
});

test("requests a forced background refresh", async () => {
  const sentMessages: unknown[] = [];
  await fetchCurrentVideoState("abc123XYZ_9", {
    forceRefresh: true,
    getCurrentTab: async () =>
      ({
        id: 42,
      }) as chrome.tabs.Tab,
    sendMessage: async (message) => {
      sentMessages.push(message);
      return {
        status: "success",
      };
    },
  });

  assert.deepEqual(sentMessages, [
    {
      action: MESSAGE_ACTIONS.SCRAPE_VIDEO,
      videoId: "abc123XYZ_9",
      tabId: 42,
      suppressErrors: true,
      forceRefresh: true,
    },
  ]);
});
