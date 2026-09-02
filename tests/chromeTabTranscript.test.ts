/** Verifies Chrome-tab caption selection and active-video metadata integrity. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTranscriptFromChromeTab,
  getChromeTabTrackPriority,
  getChromeTabTrackType,
} from "../src/core/transcript/chromeTab.ts";

test("prefers auto-generated English tracks over manual English tracks", () => {
  const manualEnglishTrack = {
    languageCode: "en-US",
    kind: null,
    name: "English (United States)",
    vssId: ".en",
  };
  const autoEnglishTrack = {
    languageCode: "en",
    kind: "asr",
    name: "English (auto-generated)",
    vssId: "a.en",
  };

  const sortedTracks = [manualEnglishTrack, autoEnglishTrack].sort(
    (leftTrack, rightTrack) =>
      getChromeTabTrackPriority(leftTrack) - getChromeTabTrackPriority(rightTrack),
  );

  assert.equal(sortedTracks[0], autoEnglishTrack);
  assert.equal(getChromeTabTrackType(autoEnglishTrack), "auto");
  assert.equal(getChromeTabTrackType(manualEnglishTrack), "manual");
});

test("recognizes auto-generated tracks from metadata when kind is missing", () => {
  const inferredAutoTrack = {
    languageCode: "en",
    kind: null,
    name: "English (auto-generated)",
    vssId: "a.en",
  };
  const manualTrack = {
    languageCode: "en",
    kind: null,
    name: "English",
    vssId: ".en",
  };

  assert.equal(getChromeTabTrackType(inferredAutoTrack), "auto");
  assert.equal(getChromeTabTrackPriority(inferredAutoTrack), 0);
  assert.equal(getChromeTabTrackPriority(manualTrack), 1);
});

test("ignores stale initial player data after YouTube SPA navigation", async () => {
  const requestedVideoId = "VeizK1M7V7E";
  const staleVideoId = "ppVPLmfKSfo";
  const createPlayerResponse = (videoId: string, title: string) => ({
    videoDetails: {
      videoId,
      title,
      shortDescription: `${title} description`,
      author: `${title} channel`,
      lengthSeconds: "12",
      viewCount: "34",
    },
    microformat: {
      playerMicroformatRenderer: {
        publishDate: "2026-09-02",
      },
    },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}`,
            languageCode: "en",
            kind: "asr",
            name: { simpleText: "English (auto-generated)" },
            vssId: "a.en",
          },
        ],
      },
    },
  });
  const staleResponse = createPlayerResponse(staleVideoId, "Science Class");
  const currentResponse = createPlayerResponse(
    requestedVideoId,
    "Sam Altman on OpenAI's next model and the AI backlash",
  );
  const globals = globalThis as any;
  const previousGlobals = {
    chrome: globals.chrome,
    document: globals.document,
    fetch: globals.fetch,
    window: globals.window,
  };
  const fetchedUrls: string[] = [];

  globals.window = {
    location: { href: `https://www.youtube.com/watch?v=${requestedVideoId}` },
    setTimeout,
    ytInitialPlayerResponse: staleResponse,
  };
  globals.document = {
    title: currentResponse.videoDetails.title,
    getElementById: (id: string) =>
      id === "movie_player" ? { getPlayerResponse: () => currentResponse } : null,
    querySelector: () => null,
  };
  globals.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    fetchedUrls.push(url);
    const text = url.includes(staleVideoId) ? "stale caption" : "current caption";
    return new Response(
      JSON.stringify({
        events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: text }] }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  globals.chrome = {
    runtime: {},
    tabs: {
      get: (_tabId: number, callback: (tab: chrome.tabs.Tab) => void) =>
        callback({
          id: 42,
          title: currentResponse.videoDetails.title,
          url: `https://www.youtube.com/watch?v=${requestedVideoId}`,
        }),
    },
    scripting: {
      executeScript: async ({ func, args }: { func: (...args: any[]) => any; args: any[] }) => [
        { result: await func(...args) },
      ],
    },
  };

  try {
    const result = await fetchTranscriptFromChromeTab(requestedVideoId, 42);

    assert.equal(result.videoId, requestedVideoId);
    assert.equal(result.title, currentResponse.videoDetails.title);
    assert.equal(result.transcript_only_text, "current caption");
    assert.equal(
      fetchedUrls.some((url) => url.includes(staleVideoId)),
      false,
    );
  } finally {
    globals.chrome = previousGlobals.chrome;
    globals.document = previousGlobals.document;
    globals.fetch = previousGlobals.fetch;
    globals.window = previousGlobals.window;
  }
});
