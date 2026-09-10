/** Verifies atomic Markdown hashline edits, stale anchors, and bounded draft updates. */

import assert from "node:assert/strict";
import test from "node:test";

import { createSummaryArtifact } from "../src/core/agent/artifact.ts";

const summary = "Original\n\n## One\nDetails";
function anchor(text: string, match: string) {
  return text
    .split("\n")
    .find((line) => line.includes(match))!
    .split(":", 1)[0];
}

test("hashline edits replace only selected Markdown and reject stale anchors", () => {
  const artifact = createSummaryArtifact(summary);
  const start = anchor(artifact.readHashlines().text!, "Original");
  artifact.edit({ edits: [{ op: "replace", start, end: null, lines: ["**Updated**"] }] });
  assert.equal(artifact.read().summary, "**Updated**\n\n## One\nDetails");
  assert.throws(
    () => artifact.edit({ edits: [{ op: "replace", start, end: null, lines: [] }] }),
    /Stale or invalid/,
  );
  assert.throws(() => artifact.write(summary), /already exists/);
});

test("invalid anchors, overlapping edits, and empty summaries change nothing", () => {
  const artifact = createSummaryArtifact("Original");
  const before = artifact.readHashlines();
  const edit = {
    op: "replace" as const,
    start: anchor(before.text!, "Original"),
    end: null,
    lines: ["Updated"],
  };
  for (const edits of [
    [{ ...edit, start: "2#00000000" }],
    [edit, edit],
    [{ ...edit, lines: [] }],
    [{ ...edit, lines: [" \n"] }],
    [{ ...edit, lines: ["   "] }],
  ]) {
    assert.throws(() => artifact.edit({ edits }));
    assert.deepEqual(artifact.readHashlines(), before);
  }
});

test("insertion and deletion use snapshot anchors and enforce the edit budget", () => {
  const artifact = createSummaryArtifact(summary);
  let read = artifact.readHashlines();
  artifact.edit({
    edits: [
      {
        op: "insert_before",
        start: anchor(read.text!, "## One"),
        end: null,
        lines: ["Start 00:01"],
      },
    ],
  });
  assert.match(artifact.read().summary!, /Start 00:01/);
  read = artifact.readHashlines();
  artifact.edit({
    edits: [
      {
        op: "insert_after",
        start: anchor(read.text!, "Start 00:01"),
        end: null,
        lines: ["End 00:10"],
      },
    ],
  });
  read = artifact.readHashlines();
  artifact.edit({
    edits: [
      {
        op: "replace",
        start: anchor(read.text!, "Start 00:01"),
        end: anchor(read.text!, "End 00:10"),
        lines: [],
      },
    ],
  });
  assert.equal(artifact.read().summary, summary);
  read = artifact.readHashlines();
  assert.throws(
    () =>
      artifact.edit({
        edits: [
          {
            op: "replace",
            start: anchor(read.text!, "Original"),
            end: null,
            lines: ["Over budget"],
          },
        ],
      }),
    /revision limit/,
  );
});
