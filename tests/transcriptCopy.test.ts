import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscriptWithMetadata } from "../src/sidepanel/lib/transcript-copy.ts";

test("builds transcript copy text with video metadata header", () => {
  const text = buildTranscriptWithMetadata("First line.\nSecond line.", {
    title: "A useful video",
    author: "Example Channel",
    duration: "00:12:34",
    uploadDate: "2026-04-27",
  });

  assert.equal(
    text,
    [
      "Title: A useful video",
      "Author: Example Channel",
      "Duration: 12:34",
      "Date: Apr 27, 2026",
      "",
      "First line.\nSecond line.",
    ].join("\n"),
  );
});

test("omits missing metadata fields", () => {
  const text = buildTranscriptWithMetadata("Only transcript.", {
    title: null,
    author: "Example Channel",
    duration: null,
    uploadDate: undefined,
  });

  assert.equal(text, "Author: Example Channel\n\nOnly transcript.");
});
