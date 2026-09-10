/** Protects transcript text resolution and the Markdown returned by summary handlers. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingTranscript,
  clearTranscriptCache,
  setCachedTranscript,
  setPendingTranscript,
} from "../src/core/transcript/cache.ts";
import { resolveTranscriptText } from "../src/core/transcript/text.ts";
import type { TranscriptResponse } from "../src/core/types.ts";

test("supplied transcript text remains untrimmed", async () => {
  assert.equal(await resolveTranscriptText("  Supplied transcript.\n"), "  Supplied transcript.\n");
});

test("URL resolution joins only the explicitly requested tab's pending transcript", async () => {
  const videoId = "abcdefghijk";
  const url = `https://www.youtube.com/watch?v=${videoId}`;
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
      resolveTranscriptText(url, videoId, { tabId: 1 }),
      resolveTranscriptText(url, videoId, { tabId: 2 }),
    ]);
    assert.deepEqual(results, ["First tab", "Second tab"]);
    await assert.rejects(resolveTranscriptText(url, videoId, {}), /active YouTube watch tab/);
  } finally {
    clearPendingTranscript(videoId, 1);
    clearPendingTranscript(videoId, 2);
  }
});

test("URL resolution preserves cached text preference and segment fallback", async () => {
  const videoId = "VeizK1M7V7E";
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const transcript = [
    { text: "First segment.", startMs: 0, endMs: 1000 },
    { text: "Second segment.", startMs: 1000, endMs: 2000 },
  ];
  try {
    for (const [text, expected] of [
      ["  Preferred transcript.  ", "Preferred transcript."],
      ["", "First segment. Second segment."],
    ]) {
      setCachedTranscript(videoId, {
        transcript_only_text: text,
        transcript,
      } as TranscriptResponse);
      assert.equal(await resolveTranscriptText(url), expected);
    }
    setCachedTranscript(videoId, { transcript_only_text: "   ", transcript } as TranscriptResponse);
    await assert.rejects(resolveTranscriptText(url), /No transcript found/);
  } finally {
    clearTranscriptCache(videoId);
  }
});

test("missing video IDs and unavailable transcripts fail before agent execution", async () => {
  await assert.rejects(
    resolveTranscriptText("https://www.youtube.com/watch"),
    /Could not extract video id/,
  );
  await assert.rejects(
    resolveTranscriptText("https://www.youtube.com/watch?v=VeizK1M7V7E"),
    /No transcript available/,
  );
});
