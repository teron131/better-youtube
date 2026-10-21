/** Pins the metadata header prepended when a transcript is copied with video details. */

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

test("copied upload dates keep their calendar day in any timezone and pass unparseable text through", () => {
  const dateLine = (uploadDate: string) =>
    buildTranscriptWithMetadata("Text.", { uploadDate }).split("\n")[0];

  assert.equal(dateLine("20240105"), "Date: January 5, 2024");
  assert.equal(dateLine("2024-01-05"), "Date: Jan 5, 2024");
  assert.equal(dateLine("2024-12-31"), "Date: Dec 31, 2024");
  assert.equal(dateLine("Premiered last week"), "Date: Premiered last week");
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
