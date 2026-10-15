/** Protects summary transcript resolution order, tab scoping, and missing-transcript failures. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingTranscript,
  clearTranscriptCache,
  getCachedTranscript,
  getPendingTranscript,
  setCachedTranscript,
  setPendingTranscript,
} from "../src/core/transcript/cache.ts";
import type { TranscriptResponse } from "../src/core/types.ts";

const local: Record<string, unknown> = {};
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: {
        get(keys: string[], callback: (items: Record<string, unknown>) => void) {
          callback(
            Object.fromEntries(keys.filter((key) => key in local).map((key) => [key, local[key]])),
          );
        },
      },
    },
  },
});

const { resolveTranscriptText } = await import("../src/core/videoContext.ts");

test("supplied transcript text remains untrimmed", async () => {
  assert.equal(
    await resolveTranscriptText("abcdefghijk", "  Supplied transcript.\n", {}),
    "  Supplied transcript.\n",
  );
});

test("selected tracks isolate cached and pending transcripts from the default track", () => {
  const videoId = "track-cache-test";
  const automatic = {
    transcript_only_text: "Automatic",
    selectedCaptionTrackId: "a.en",
  } as TranscriptResponse;
  const manual = {
    transcript_only_text: "Manual",
    selectedCaptionTrackId: ".en",
  } as TranscriptResponse;
  const translated = {
    transcript_only_text: "English translation",
    selectedCaptionTrackId: "translated:en:.fr",
  } as TranscriptResponse;
  const automaticPending = Promise.resolve(automatic);
  const manualPending = Promise.resolve(manual);
  try {
    setCachedTranscript(videoId, automatic);
    setCachedTranscript(videoId, manual, ".en");
    setCachedTranscript(videoId, translated, "translated:en:.fr");
    assert.equal(getCachedTranscript(videoId), automatic);
    assert.equal(getCachedTranscript(videoId, "a.en"), automatic);
    assert.equal(getCachedTranscript(videoId, ".en"), manual);
    assert.equal(getCachedTranscript(videoId, ".fr"), undefined);
    assert.equal(getCachedTranscript(videoId, "translated:en:.fr"), translated);
    setPendingTranscript(videoId, automaticPending, 1);
    setPendingTranscript(videoId, manualPending, 1, ".en");
    assert.equal(getPendingTranscript(videoId, 1), automaticPending);
    assert.equal(getPendingTranscript(videoId, 1, ".en"), manualPending);
    clearPendingTranscript(videoId, 1, ".en");
    assert.equal(getPendingTranscript(videoId, 1), automaticPending);
    assert.equal(getPendingTranscript(videoId, 1, ".en"), undefined);
    clearTranscriptCache(videoId);
    assert.equal(getCachedTranscript(videoId), undefined);
    assert.equal(getCachedTranscript(videoId, ".en"), undefined);
    assert.equal(getCachedTranscript(videoId, "a.en"), undefined);
    assert.equal(getCachedTranscript(videoId, "translated:en:.fr"), undefined);
  } finally {
    clearTranscriptCache(videoId);
    clearPendingTranscript(videoId, 1);
    clearPendingTranscript(videoId, 1, ".en");
  }
});

test("resolution joins only the explicitly requested tab's pending transcript", async () => {
  const videoId = "abcdefghijk";
  setPendingTranscript(
    videoId,
    Promise.resolve({ transcript_only_text: "First tab" } as TranscriptResponse),
    1,
  );
  setPendingTranscript(
    videoId,
    Promise.resolve({ transcript_only_text: "Second tab" } as TranscriptResponse),
    2,
  );
  try {
    const results = await Promise.all([
      resolveTranscriptText(videoId, undefined, { tabId: 1 }),
      resolveTranscriptText(videoId, undefined, { tabId: 2 }),
    ]);
    assert.deepEqual(results, ["First tab", "Second tab"]);
    await assert.rejects(resolveTranscriptText(videoId, undefined, {}), /active YouTube watch tab/);
  } finally {
    clearPendingTranscript(videoId, 1);
    clearPendingTranscript(videoId, 2);
  }
});

test("resolution prefers cached text, then segments, then stored subtitles", async () => {
  const videoId = "VeizK1M7V7E";
  const transcript = [
    { text: "First segment.", startMs: 0, endMs: 1000, startTimeText: "0:00" },
    { text: "Second segment.", startMs: 1000, endMs: 2000, startTimeText: "0:01" },
  ];
  try {
    for (const [text, expected] of [
      ["  Preferred transcript.  ", "  Preferred transcript.  "],
      ["", "First segment. Second segment."],
    ]) {
      setCachedTranscript(videoId, {
        transcript_only_text: text,
        transcript,
      } as TranscriptResponse);
      assert.equal(await resolveTranscriptText(videoId, undefined, { tabId: 1 }), expected);
    }
    clearTranscriptCache(videoId);
    local[videoId] = [{ text: "Stored subtitle.", startTime: 0, endTime: 1000 }];
    assert.equal(await resolveTranscriptText(videoId, undefined, { tabId: 1 }), "Stored subtitle.");
  } finally {
    clearTranscriptCache(videoId);
    delete local[videoId];
  }
});

test("a video without transcript text fails before agent execution", async () => {
  const videoId = "VeizK1M7V7E";
  setCachedTranscript(videoId, {
    transcript_only_text: "  ",
    transcript: [],
  } as TranscriptResponse);
  try {
    await assert.rejects(
      resolveTranscriptText(videoId, undefined, { tabId: 1 }),
      /No transcript found/,
    );
  } finally {
    clearTranscriptCache(videoId);
  }
});
