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

test("lists tracks in priority order and fetches only the selected manual language track", async () => {
  const tracks = [
    { languageCode: "fr", name: "French", vssId: ".fr" },
    { languageCode: "fr", name: "French (auto-generated)", vssId: "a.fr" },
    { languageCode: "en", name: "English", vssId: ".en" },
    { languageCode: "en", name: "English (auto-generated)", vssId: "a.en" },
  ].map((track) => ({
    ...track,
    baseUrl: `https://www.youtube.com/api/timedtext?track=${track.vssId}`,
    name: { simpleText: track.name },
  }));
  const { result, fetchedUrls } = await extractFromPage(undefined, ".fr", tracks);
  assert.equal(result.selectedCaptionTrackId, ".fr");
  assert.deepEqual(
    result.captionTracks?.map((track) => [track.id, track.kind, track.priority]),
    [
      ["a.en", "auto", 0],
      [".en", "manual", 1],
      ["a.fr", "auto", 2],
      [".fr", "manual", 3],
      ["translated:en:.fr", "translated", 4],
    ],
  );
  assert.equal(fetchedUrls.length, 1);
  assert.equal(new URL(fetchedUrls[0]).searchParams.get("track"), ".fr");
});

test("explicit selection remains pinned when fallback clients offer another track", async () => {
  const fetchedTracks: string[] = [];
  await assert.rejects(
    extractFromPage(
      async (url) => {
        if (url.includes("/youtubei/"))
          return Response.json(createPlayerResponse(videoId, videoTitle));
        fetchedTracks.push(new URL(url).searchParams.get("track") || "auto");
        return new Response("", { status: 200 });
      },
      ".fr",
      [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?track=manual",
          languageCode: "fr",
          name: { simpleText: "French" },
          vssId: ".fr",
        },
      ],
    ),
    /All caption fetch attempts/,
  );
  assert.deepEqual(fetchedTracks, ["manual", "manual", "manual", "manual"]);
});

test("missing selected tracks fail instead of fetching the default track", async () => {
  let captionFetches = 0;
  await assert.rejects(
    extractFromPage(async (url) => {
      if (url.includes("/youtubei/"))
        return Response.json(createPlayerResponse(videoId, videoTitle));
      captionFetches += 1;
      return captionResponse("wrong track");
    }, ".missing"),
    /selected caption track is no longer available/,
  );
  assert.equal(captionFetches, 0);
});

test("metadata-derived track IDs survive signed URL changes", async () => {
  const track = { languageCode: "fr", name: { simpleText: "French" } };
  const first = await extractFromPage(undefined, undefined, [
    { ...track, baseUrl: "https://www.youtube.com/api/timedtext?sig=first" },
  ]);
  const selectedId = first.result.selectedCaptionTrackId;
  assert.ok(selectedId);
  const second = await extractFromPage(undefined, selectedId, [
    { ...track, baseUrl: "https://www.youtube.com/api/timedtext?sig=second" },
  ]);
  assert.equal(second.result.selectedCaptionTrackId, selectedId);
});

test("offers English translation without changing the default non-English source", async () => {
  const { result, fetchedUrls } = await extractFromPage(undefined, undefined, [frenchTrack]);
  assert.equal(result.selectedCaptionTrackId, ".fr");
  assert.deepEqual(
    result.captionTracks?.map((track) => [track.id, track.languageCode, track.kind]),
    [
      [".fr", "fr", "manual"],
      ["translated:en:.fr", "en", "translated"],
    ],
  );
  assert.equal(fetchedUrls.length, 1);
  assert.equal(new URL(fetchedUrls[0]).searchParams.has("tlang"), false);
});

test("loads English translation from the selected source and retains a separate identity", async () => {
  const { result, fetchedUrls } = await extractFromPage(
    async (url) => {
      const params = new URL(url).searchParams;
      assert.equal(params.get("track"), ".fr");
      assert.equal(params.get("tlang"), "en");
      return captionResponse("These captions are translated into English.");
    },
    "translated:en:.fr",
    [frenchTrack],
  );
  assert.equal(result.transcript_only_text, "These captions are translated into English.");
  assert.equal(result.selectedCaptionTrackId, "translated:en:.fr");
  assert.equal(
    result.captionTracks?.find((track) => track.id === result.selectedCaptionTrackId)?.kind,
    "translated",
  );
  assert.equal(fetchedUrls.length, 1);
});

test("keeps English translation available alongside native English captions", async () => {
  const nativeEnglish = createPlayerResponse(videoId, videoTitle).captions
    .playerCaptionsTracklistRenderer.captionTracks[0];
  const { result } = await extractFromPage(undefined, undefined, [nativeEnglish, frenchTrack]);
  assert.equal(result.selectedCaptionTrackId, "a.en");
  assert.ok(result.captionTracks?.some((track) => track.id === "translated:en:.fr"));
});

test("translated fallback never switches to another source language", async () => {
  const fetchedUrls: string[] = [];
  await assert.rejects(
    extractFromPage(
      async (url) => {
        if (url.includes("/youtubei/"))
          return Response.json(createPlayerResponse(videoId, videoTitle));
        fetchedUrls.push(url);
        return new Response("", { status: 200 });
      },
      "translated:en:.fr",
      [frenchTrack],
    ),
    /All caption fetch attempts/,
  );
  assert.equal(fetchedUrls.length, 8);
  assert.equal(
    fetchedUrls.filter((url) => new URL(url).searchParams.get("tlang") === "en").length,
    4,
  );
  assert.ok(fetchedUrls.every((url) => new URL(url).searchParams.get("track") === ".fr"));
});

test("prepares non-translatable manual sources for explicit AI English translation", async () => {
  const { result, fetchedUrls } = await extractFromPage(
    async (url) => {
      assert.equal(new URL(url).searchParams.has("tlang"), false);
      return captionResponse("Bonjour tout le monde.");
    },
    "translated:en:.fr",
    [{ ...frenchTrack, isTranslatable: false }],
  );
  assert.equal(result.translationRequired, true);
  assert.equal(result.selectedCaptionTrackId, "translated:en:.fr");
  assert.equal(result.transcript_only_text, "Bonjour tout le monde.");
  assert.equal(fetchedUrls.length, 1);
});

test("unavailable YouTube translation falls back to the pinned source marked as needing AI", async () => {
  const { result, fetchedUrls } = await extractFromPage(
    async (url) => {
      if (url.includes("/youtubei/"))
        return Response.json(createPlayerResponse(videoId, videoTitle));
      assert.equal(new URL(url).searchParams.get("track"), ".fr");
      return new URL(url).searchParams.has("tlang")
        ? new Response("", { status: 200 })
        : captionResponse("Bonjour tout le monde.");
    },
    "translated:en:.fr",
    [frenchTrack],
  );
  assert.equal(result.translationRequired, true);
  assert.equal(result.selectedCaptionTrackId, "translated:en:.fr");
  assert.equal(result.transcript_only_text, "Bonjour tout le monde.");
  assert.equal(fetchedUrls.filter((url) => !url.includes("/youtubei/")).length, 5);
});

const frenchTrack = {
  baseUrl: "https://www.youtube.com/api/timedtext?track=.fr",
  languageCode: "fr",
  name: { simpleText: "French" },
  vssId: ".fr",
  isTranslatable: true,
};

/** Installs a matching watch page beside stale SPA data and restores its globals after extraction. */
async function extractFromPage(
  fetchReply?: (url: string, init?: RequestInit) => Promise<Response>,
  captionTrackId?: string,
  tracks?: Array<Record<string, unknown>>,
) {
  const staleResponse = createPlayerResponse(staleVideoId, "Science Class");
  const currentResponse = createPlayerResponse(videoId, videoTitle);
  if (tracks)
    currentResponse.captions.playerCaptionsTracklistRenderer.captionTracks = tracks as any;
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
      executeScript: async ({ func, args }: { func: (...args: any[]) => any; args: any[] }) => {
        assert.ok(
          args.every((arg) => arg !== undefined),
          "Chrome script arguments must be JSON-serializable",
        );
        return [{ result: await func(...args) }];
      },
    },
  };

  try {
    const result = await fetchTranscriptFromChromeTab(videoId, 42, captionTrackId);

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
