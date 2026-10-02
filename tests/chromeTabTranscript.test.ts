/** Verifies Chrome-tab caption selection and active-video metadata integrity. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchTranscriptFromChromeTab,
  getChromeTabTrackPriority,
  getChromeTabTrackType,
} from "../src/core/transcript/chromeTab.ts";

const videoId = "VeizK1M7V7E";
const staleVideoId = "ppVPLmfKSfo";
const videoTitle = "Sam Altman on OpenAI's next model and the AI backlash";

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

test("ignores stale initial player data and skips fallback requests when page captions work", async () => {
  const { result, fetchedUrls } = await extractFromPage();
  assert.equal(result.videoId, videoId);
  assert.equal(result.title, videoTitle);
  assert.equal(result.transcript_only_text, "current caption");
  assert.equal(fetchedUrls.length, 1);
  assert.equal(
    fetchedUrls.some((url) => url.includes(staleVideoId)),
    false,
  );
});

test("requests fallback clients in order and stops after the first usable caption source", async () => {
  for (const successfulClient of ["ANDROID", "IOS"]) {
    const requestedClients: string[] = [];
    const captionSources: string[] = [];
    const { result } = await extractFromPage(async (url, init) => {
      if (url.includes("/youtubei/")) {
        const client = JSON.parse(String(init?.body)).context.client.clientName;
        requestedClients.push(client);
        if (client === "IOS") {
          assert.equal(captionSources.filter((source) => source === "ANDROID").length, 4);
        } else {
          assert.equal(captionSources.filter((source) => source === "page").length, 4);
        }
        return Response.json(
          createPlayerResponse(
            videoId,
            "Fallback title",
            `https://www.youtube.com/api/timedtext?source=${client}`,
          ),
        );
      }
      const source = new URL(url).searchParams.get("source") || "page";
      captionSources.push(source);
      return source === successfulClient
        ? captionResponse("fallback caption")
        : new Response("", { status: 200 });
    });
    assert.equal(result.transcript_only_text, "fallback caption");
    assert.equal(result.title, "Fallback title");
    assert.deepEqual(
      requestedClients,
      successfulClient === "ANDROID" ? ["ANDROID"] : ["ANDROID", "IOS"],
    );
    assert.equal(captionSources.at(-1), successfulClient);
  }
});

/** Installs a matching watch page beside stale SPA data and restores its globals after extraction. */
async function extractFromPage(
  fetchReply?: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const staleResponse = createPlayerResponse(staleVideoId, "Science Class");
  const currentResponse = createPlayerResponse(videoId, videoTitle);
  const globals = globalThis as any;
  const previousGlobals = {
    chrome: globals.chrome,
    document: globals.document,
    fetch: globals.fetch,
    window: globals.window,
  };
  const fetchedUrls: string[] = [];

  globals.window = {
    location: { href: `https://www.youtube.com/watch?v=${videoId}` },
    setTimeout,
    ytInitialPlayerResponse: staleResponse,
    ytcfg: { get: (key: string) => (key === "INNERTUBE_API_KEY" ? "page-api-key" : undefined) },
  };
  globals.document = {
    title: currentResponse.videoDetails.title,
    getElementById: (id: string) =>
      id === "movie_player" ? { getPlayerResponse: () => currentResponse } : null,
    querySelector: () => null,
  };
  globals.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    fetchedUrls.push(url);
    if (fetchReply) return fetchReply(url, init);
    assert.ok(!url.includes("/youtubei/"), "usable page captions must not request fallback data");
    const text = url.includes(staleVideoId) ? "stale caption" : "current caption";
    return captionResponse(text);
  };
  globals.chrome = {
    runtime: {},
    tabs: {
      get: (_tabId: number, callback: (tab: chrome.tabs.Tab) => void) =>
        callback({
          id: 42,
          title: currentResponse.videoDetails.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        }),
    },
    scripting: {
      executeScript: async ({ func, args }: { func: (...args: any[]) => any; args: any[] }) => [
        { result: await func(...args) },
      ],
    },
  };

  try {
    const result = await fetchTranscriptFromChromeTab(videoId, 42);

    return { result, fetchedUrls };
  } finally {
    globals.chrome = previousGlobals.chrome;
    globals.document = previousGlobals.document;
    globals.fetch = previousGlobals.fetch;
    globals.window = previousGlobals.window;
  }
}

function createPlayerResponse(
  id: string,
  title: string,
  captionUrl = `https://www.youtube.com/api/timedtext?v=${id}`,
) {
  return {
    videoDetails: {
      videoId: id,
      title,
      shortDescription: `${title} description`,
      author: `${title} channel`,
      lengthSeconds: "12",
      viewCount: "34",
    },
    microformat: { playerMicroformatRenderer: { publishDate: "2026-09-02" } },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: captionUrl,
            languageCode: "en",
            kind: "asr",
            name: { simpleText: "English (auto-generated)" },
            vssId: "a.en",
          },
        ],
      },
    },
  };
}

function captionResponse(text: string): Response {
  return Response.json({
    events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: text }] }],
  });
}
