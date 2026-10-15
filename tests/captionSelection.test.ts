/** Verifies selected caption ownership across raw loading, explicit refinement, and superseded jobs. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

import { VideoWorkloadLifecycle } from "../src/background/workloads.ts";
import { MESSAGE_ACTIONS } from "../src/core/constants.ts";
import type { SubtitleSegment } from "../src/core/storage.ts";
import type { CaptionTrack, TranscriptResponse } from "../src/core/types.ts";

const videoId = "abcdefghijk";
const tracks: CaptionTrack[] = [
  { id: "a.en", languageCode: "en", name: "English", kind: "auto", priority: 0 },
  { id: ".fr", languageCode: "fr", name: "French", kind: "manual", priority: 3 },
  { id: ".zh", languageCode: "zh", name: "Chinese", kind: "manual", priority: 3 },
  { id: "translated:en:.fr", languageCode: "en", name: "English", kind: "translated", priority: 4 },
];
const local: Record<string, any> = {};
const overlays: any[] = [];
const notifications: any[] = [];
const extractedTracks: Array<string | undefined> = [];
const refinedInputs: SubtitleSegment[][] = [];
const translatedInputs: SubtitleSegment[][] = [];
let translationRequired = false;
let sourceText: string | null = null;
let storageWrites = 0;
let contentListener: (message: any, sender: unknown, reply: (response: any) => void) => boolean;
let translateReply = async (segments: SubtitleSegment[]) =>
  segments.map((segment) => ({ ...segment, text: "English translation" }));
let workloads: VideoWorkloadLifecycle;
let refineReply: (
  segments: SubtitleSegment[],
  partial: (segments: SubtitleSegment[]) => void,
) => Promise<SubtitleSegment[]> = async (segments) =>
  segments.map((segment) => ({ ...segment, text: `Refined ${segment.text}` }));

function storageArea(items: Record<string, any>) {
  return {
    get(keys: string[] | null, callback: (value: Record<string, any>) => void) {
      callback(
        keys === null
          ? { ...items }
          : Object.fromEntries(keys.filter((key) => key in items).map((key) => [key, items[key]])),
      );
    },
    set(values: Record<string, unknown>, callback: () => void) {
      storageWrites++;
      Object.assign(items, values);
      callback();
    },
    remove(keys: string[], callback: () => void) {
      keys.forEach((key) => delete items[key]);
      callback();
    },
    getBytesInUse(_keys: unknown, callback: (bytes: number) => void) {
      callback(0);
    },
  };
}

Object.assign(globalThis, {
  chrome: {
    storage: { local: storageArea(local), session: storageArea({}) },
    runtime: {
      onMessage: {
        addListener: (listener: typeof contentListener) => {
          contentListener = listener;
        },
      },
      sendMessage: async (message: unknown) => {
        notifications.push(message);
      },
    },
    tabs: {
      sendMessage: async (tabId: number, message: unknown) => {
        overlays.push({ tabId, ...(message as object) });
      },
    },
  },
  captionTestBoundaries: {
    fetch: async (
      requestedVideoId: string,
      tabId: number,
      trackId?: string,
    ): Promise<TranscriptResponse> => {
      assert.equal(requestedVideoId, videoId);
      assert.equal(tabId, 7);
      extractedTracks.push(trackId);
      const selectedTrack = tracks.find((track) => track.id === (trackId ?? "a.en"));
      assert.ok(selectedTrack, "the extractor must receive an available exact track ID");
      return {
        title: "Selected caption video",
        description: "Video description",
        transcript: [
          {
            text: sourceText ?? `Raw ${selectedTrack.id}`,
            startMs: 0,
            endMs: 1000,
            startTimeText: "0:00",
          },
        ],
        captionTracks: tracks,
        selectedCaptionTrackId: selectedTrack.id,
        ...(translationRequired && selectedTrack.kind === "translated"
          ? { translationRequired: true }
          : {}),
      };
    },
    refine: async (
      segments: SubtitleSegment[],
      _title: string,
      _description: string,
      _model: string,
      partial: (segments: SubtitleSegment[]) => void,
    ) => {
      refinedInputs.push(segments);
      return refineReply(segments, partial);
    },
    translate: async (segments: SubtitleSegment[]) => {
      translatedInputs.push(segments);
      return translateReply(segments);
    },
  },
});

// Stub external extraction and inference while exercising production routing, cache, lifecycle, and storage.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const path = specifier.slice(2);
      const suffix = ["core/transcript", "core/refiner"].includes(path) ? "/index.ts" : ".ts";
      return nextResolve(new URL(`../src/${path}${suffix}`, import.meta.url).href, context);
    }
    if (
      specifier.startsWith("./") &&
      !specifier.endsWith(".ts") &&
      (context.parentURL?.includes("/src/background/") ||
        context.parentURL?.includes("/src/content/"))
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/content/subtitleRenderer.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const applyCaptionFontSize=()=>{}; export const clearRenderer=()=>{}; export const startSubtitleDisplay=()=>{}; export const stopSubtitleDisplay=()=>{};",
      };
    }
    if (url.endsWith("/content/videoHelpers.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const isCurrentVideo=()=>true;",
      };
    }
    if (url.endsWith("/core/transcript/chromeTab.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const fetchTranscriptFromChromeTab = (...args) => globalThis.captionTestBoundaries.fetch(...args);",
      };
    }
    if (url.endsWith("/core/refiner/refiner.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const refineTranscriptWithLLM = (...args) => globalThis.captionTestBoundaries.refine(...args); export const translateTranscriptWithLLM = (...args) => globalThis.captionTestBoundaries.translate(...args);",
      };
    }
    return nextLoad(url, context);
  },
});

const { handleScrapeVideo } = await import("../src/background/video.ts");
const { handleFetchSubtitles } = await import("../src/background/captions.ts");
const { setupMessageListener } = await import("../src/content/messageHandler.ts");
const { clearTranscriptCache } = await import("../src/core/transcript/cache.ts");
const { getCaptionState, getSubtitles } = await import("../src/core/storage.ts");
const { loadCachedVideoState, EMPTY_VIDEO_STATE } =
  await import("../src/sidepanel/pages/index/cachedVideoState.ts");

beforeEach(() => {
  for (const key of Object.keys(local)) delete local[key];
  overlays.length = notifications.length = extractedTracks.length = refinedInputs.length = 0;
  translatedInputs.length = 0;
  translationRequired = false;
  sourceText = null;
  storageWrites = 0;
  translateReply = async (segments) =>
    segments.map((segment) => ({ ...segment, text: "English translation" }));
  clearTranscriptCache(videoId);
  workloads = new VideoWorkloadLifecycle();
  refineReply = async (segments) =>
    segments.map((segment) => ({ ...segment, text: `Refined ${segment.text}` }));
});

async function select(captionTrackId?: string) {
  const responses: any[] = [];
  await handleScrapeVideo(
    { action: MESSAGE_ACTIONS.SCRAPE_VIDEO, videoId, captionTrackId },
    { tabId: 7, captionWorkloads: workloads },
    (response) => responses.push(response),
  );
  assert.equal(responses.length, 1);
  assert.equal(responses[0].status, "success");
  return responses[0];
}

async function refine(captionTrackId?: string, confirmTranslation = false) {
  const responses: any[] = [];
  await handleFetchSubtitles(
    {
      action: MESSAGE_ACTIONS.FETCH_SUBTITLES,
      videoId,
      requestId: "refine-request",
      modelSelection: "test-model",
      captionTrackId,
      confirmTranslation,
    },
    { tabId: 7, captionWorkloads: workloads },
    (response) => responses.push(response),
  );
  return responses;
}

test("switching language/manual tracks stores exact raw text and updates the overlay without refinement", async () => {
  await select();
  const response = await select(".fr");
  assert.deepEqual(extractedTracks, [undefined, ".fr"]);
  assert.equal(refinedInputs.length, 0);
  assert.equal(response.transcript, "Raw .fr");
  assert.deepEqual(response.captionSegments, await getSubtitles(videoId));
  assert.deepEqual(await getCaptionState(videoId), {
    tracks,
    selectedTrackId: ".fr",
    status: "original",
  });
  assert.equal((await getSubtitles(videoId))?.[0].text, "Raw .fr");
  assert.equal(overlays.at(-1).subtitles[0].text, "Raw .fr");
  assert.equal(overlays.at(-1).isRawFallback, true);
  assert.equal(overlays.at(-1).tabId, 7);
});

test("background owns Traditional Chinese persistence and content display never rewrites caption storage", async () => {
  sourceText = "汉语字幕";
  const selected = await select(".zh");
  assert.equal(selected.transcript, "漢語字幕");
  assert.equal((await getSubtitles(videoId))?.[0].text, "漢語字幕");
  refineReply = async (segments, partial) => {
    partial(segments.map((segment) => ({ ...segment, text: "正在处理" })));
    return segments.map((segment) => ({ ...segment, text: "字幕已经修正" }));
  };
  await refine(".zh");
  assert.equal(
    refinedInputs[0][0].text,
    "汉语字幕",
    "the model still receives the original source",
  );
  assert.equal(overlays.at(-2).subtitles[0].text, "正在處理");
  assert.equal(overlays.at(-1).subtitles[0].text, "字幕已經修正");
  const saved = await getSubtitles(videoId);
  assert.equal(saved?.[0].text, "字幕已經修正");
  const contentState = {
    currentVideoId: videoId,
    currentSubtitles: [],
    showSubtitlesEnabled: false,
    userInteractedWithToggle: false,
  };
  setupMessageListener(contentState, async () => false);
  const writesBeforeDisplay = storageWrites;
  contentListener(overlays.at(-1), {}, () => {});
  await Promise.resolve();
  assert.deepEqual(contentState.currentSubtitles, saved);
  assert.equal(storageWrites, writesBeforeDisplay);
});

for (const requestTrackId of [undefined, ".fr"]) {
  test(`confirmation refines only the ${requestTrackId ? "explicitly requested" : "saved"} track`, async () => {
    await select(".fr");
    assert.deepEqual(await refine(requestTrackId), [{ status: "processing" }]);
    assert.deepEqual(extractedTracks, [".fr"]);
    assert.equal(refinedInputs.length, 1);
    assert.equal(refinedInputs[0][0].text, "Raw .fr");
    assert.equal((await getCaptionState(videoId))?.selectedTrackId, ".fr");
    assert.equal((await getCaptionState(videoId))?.status, "refined");
    assert.equal((await getSubtitles(videoId))?.[0].text, "Refined Raw .fr");
    assert.equal(overlays.at(-1).subtitles[0].text, "Refined Raw .fr");
  });
}

test("confirmation rejects a track that differs from the currently selected source", async () => {
  await select(".fr");
  const responses = await refine("a.en");
  assert.equal(responses[0].status, "error");
  assert.match(responses[0].message, /selected caption track changed/);
  assert.equal(refinedInputs.length, 0);
  assert.deepEqual(extractedTracks, [".fr"]);
  assert.equal((await getSubtitles(videoId))?.[0].text, "Raw .fr");
});

test("English translation is displayed and refined under its own selected track", async () => {
  const trackId = "translated:en:.fr";
  const response = await select(trackId);
  assert.equal(response.transcript, `Raw ${trackId}`);
  assert.equal(refinedInputs.length, 0);
  await refine(trackId);
  assert.equal(refinedInputs[0][0].text, `Raw ${trackId}`);
  assert.equal((await getCaptionState(videoId))?.selectedTrackId, trackId);
  assert.equal((await getSubtitles(videoId))?.[0].text, `Refined Raw ${trackId}`);
});

test("AI translation selection withholds source text until explicit confirmation", async () => {
  translationRequired = true;
  const trackId = "translated:en:.fr";
  const response = await select(trackId);
  assert.equal(response.transcript, null);
  assert.deepEqual(response.captionSegments, []);
  assert.equal(response.hasTranscript, false);
  assert.equal(response.captionState.translationRequired, true);
  assert.deepEqual(await getSubtitles(videoId), []);
  assert.deepEqual(overlays.at(-1).subtitles, []);
  assert.equal(translatedInputs.length, 0);
  assert.equal(refinedInputs.length, 0);
  assert.equal((await refine(trackId))[0].status, "error");
  assert.equal(translatedInputs.length, 0);
  await refine(trackId, true);
  assert.equal(refinedInputs.length, 0);
  assert.equal(translatedInputs.length, 1);
  assert.equal(translatedInputs[0][0].text, `Raw ${trackId}`);
  assert.equal((await getCaptionState(videoId))?.status, "refined");
  assert.equal((await getCaptionState(videoId))?.translationRequired, true);
  assert.equal((await getSubtitles(videoId))?.[0].text, "English translation");
  assert.equal((await select()).transcript, "English translation");
});

test("failed AI translation never saves source text as completed English", async () => {
  translationRequired = true;
  await select("translated:en:.fr");
  translateReply = async () => {
    throw new Error("Translation batch rejected");
  };
  await refine("translated:en:.fr", true);
  assert.equal((await getCaptionState(videoId))?.status, "error");
  assert.deepEqual(await getSubtitles(videoId), []);
  assert.deepEqual(overlays.at(-1).subtitles, []);
  assert.equal((await select()).transcript, null);
  assert.equal(notifications.at(-1).error, "Translation batch rejected");
});

test("native translation becoming unavailable requires new explicit AI confirmation", async () => {
  const trackId = "translated:en:.fr";
  await select(trackId);
  translationRequired = true;
  clearTranscriptCache(videoId);
  await refine(trackId);
  assert.equal(translatedInputs.length, 0);
  assert.equal(refinedInputs.length, 0);
  assert.equal((await getCaptionState(videoId))?.translationRequired, true);
  assert.equal((await getCaptionState(videoId))?.status, "original");
  assert.deepEqual(await getSubtitles(videoId), []);
  assert.match(notifications.at(-1).error, /Choose Translate, then Confirm/);
  await refine(trackId, true);
  assert.equal(translatedInputs.length, 1);
  assert.equal((await getSubtitles(videoId))?.[0].text, "English translation");
});

test("refreshing available tracks preserves saved refinement and exposes English translation", async () => {
  await select(".fr");
  await refine(".fr");
  local[`caption_state_${videoId}`].tracks = tracks.filter((track) => track.kind !== "translated");
  const response = await select();
  assert.equal(response.transcript, "Refined Raw .fr");
  assert.deepEqual(response.captionSegments, await getSubtitles(videoId));
  assert.equal(response.captionState.status, "refined");
  assert.equal(response.captionState.selectedTrackId, ".fr");
  assert.deepEqual((await getCaptionState(videoId))?.tracks, tracks);
});

test("cached timing follows saved selected captions and clears while English translation is pending", async () => {
  await select(".fr");
  await refine(".fr");
  const refined = await loadCachedVideoState(videoId);
  assert.deepEqual(refined?.captionSegments, await getSubtitles(videoId));
  assert.equal(refined?.captionSegments?.[0].text, "Refined Raw .fr");
  assert.deepEqual(EMPTY_VIDEO_STATE.captionSegments, []);
  translationRequired = true;
  await select("translated:en:.fr");
  local[videoId] = [{ text: "Untranslated source", startTime: 0, endTime: 1000 }];
  const pending = await loadCachedVideoState(videoId);
  assert.deepEqual(pending?.captionSegments, []);
  assert.equal(pending?.scrapedTranscript, null);
});

test("a superseded refinement cannot publish partials or replace a newly selected track", async () => {
  await select("a.en");
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  refineReply = async (segments, partial) => {
    entered();
    await paused;
    partial(segments.map((segment) => ({ ...segment, text: "Stale partial" })));
    return segments.map((segment) => ({ ...segment, text: "Stale final" }));
  };
  const pending = refine("a.en");
  await started;
  await select(".fr");
  const overlayCount = overlays.length;
  release();
  await pending;
  assert.equal(overlays.length, overlayCount);
  assert.equal((await getCaptionState(videoId))?.selectedTrackId, ".fr");
  assert.equal((await getCaptionState(videoId))?.status, "original");
  assert.equal((await getSubtitles(videoId))?.[0].text, "Raw .fr");
  assert.equal(notifications.length, 0);
});
