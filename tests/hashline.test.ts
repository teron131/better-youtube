/** Verifies atomic hashline edits, snapshot checks, and JSON validation for summary artifacts. */

import assert from "node:assert/strict";
import test from "node:test";

import { createSummaryArtifact } from "../src/core/agent/artifact.ts";

const summary = { overview: "Original", chapters: [{ title: "One", description: "Details" }] };
function anchor(text: string, match: string) {
  return text
    .split("\n")
    .find((line) => line.includes(match))!
    .split(":", 1)[0];
}

test("hashline edits replace only the selected field and reject stale reads", () => {
  const artifact = createSummaryArtifact(summary);
  const read = artifact.readHashlines();
  const start = anchor(read.text!, '"overview"');
  artifact.edit({
    edits: [{ op: "replace", start, end: null, lines: ['  "overview": "Updated",'] }],
  });
  assert.deepEqual(artifact.read().summary, { chapters: summary.chapters, overview: "Updated" });
  assert.equal(summary.overview, "Original");
  assert.throws(
    () => artifact.edit({ edits: [{ op: "replace", start, end: null, lines: [] }] }),
    /Stale or invalid hashline anchor/,
  );
  assert.throws(() => artifact.write(summary), /already exists/);
});

test("invalid anchors, overlapping ranges, malformed JSON, and invalid schemas change nothing", () => {
  const artifact = createSummaryArtifact(summary);
  const before = artifact.readHashlines();
  const start = anchor(before.text!, '"overview"');
  const edit = { op: "replace" as const, start, end: null, lines: ['  "overview": "Updated",'] };
  for (const edits of [
    [{ ...edit, start: "2#00000000" }],
    [edit, edit],
    [{ ...edit, lines: ["not json"] }],
    [{ ...edit, lines: [] }],
    [{ ...edit, lines: ['  "overview": "Updated",\n'] }],
  ]) {
    assert.throws(() => artifact.edit({ edits }));
    assert.deepEqual(artifact.readHashlines(), before);
  }
});

test("insertions and range deletion use original anchors and enforce the revision budget", () => {
  const artifact = createSummaryArtifact(summary);
  let read = artifact.readHashlines();
  artifact.edit({
    edits: [
      {
        op: "insert_before",
        start: anchor(read.text!, '"title"'),
        end: null,
        lines: ['      "startTime": "00:01",'],
      },
    ],
  });
  assert.equal(artifact.read().summary!.chapters[0].startTime, "00:01");
  read = artifact.readHashlines();
  artifact.edit({
    edits: [
      {
        op: "insert_after",
        start: anchor(read.text!, '"startTime"'),
        end: null,
        lines: ['      "endTime": "00:10",'],
      },
    ],
  });
  read = artifact.readHashlines();
  artifact.edit({
    edits: [
      {
        op: "replace",
        start: anchor(read.text!, '"startTime"'),
        end: anchor(read.text!, '"endTime"'),
        lines: [],
      },
    ],
  });
  assert.deepEqual(artifact.read().summary, {
    chapters: summary.chapters,
    overview: summary.overview,
  });
  read = artifact.readHashlines();
  assert.throws(
    () =>
      artifact.edit({
        edits: [
          {
            op: "replace",
            start: anchor(read.text!, '"overview"'),
            end: null,
            lines: ['  "overview": "Over budget"'],
          },
        ],
      }),
    /revision limit/,
  );
});
