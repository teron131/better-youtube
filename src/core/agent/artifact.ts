/** Owns the editable summary draft for a single agent run; failed runs never publish partial edits. */

import { z } from "zod";

const ChapterSchema = z.object({
  startTime: z
    .string()
    .describe("Optional chapter start timestamp in the format MM:SS.")
    .optional(),
  endTime: z
    .string()
    .describe("Optional chapter end timestamp matching the same format as startTime.")
    .optional(),
  title: z.string().describe("A concise chapter heading."),
  description: z
    .string()
    .describe(
      "A substantive chapter description grounded in the transcript. Include key facts (numbers/names/steps) when present. Avoid meta-language like 'this video...' and do not include sponsorship/promotional content.",
    ),
});

export const SummaryArtifactSchema = z.object({
  chapters: z
    .array(ChapterSchema)
    .min(1)
    .describe("Chronological, non-overlapping chapters covering the core content."),
  overview: z
    .string()
    .describe(
      "An end-to-end summary of the whole content (main thesis + arc), written in direct statements without meta-language.",
    ),
});

export type SummaryArtifact = z.infer<typeof SummaryArtifactSchema>;

export const SummaryEditSchema = z.object({
  edits: z
    .array(
      z.object({
        op: z.enum(["replace", "insert_before", "insert_after"]),
        start: z.string().describe("LINE#HASH anchor copied from the latest read_summary output"),
        end: z
          .string()
          .nullable()
          .describe("Inclusive end anchor for replace, or null for a single line or insertion"),
        lines: z
          .array(z.string())
          .describe(
            "Raw replacement JSON lines without hashline prefixes; empty array deletes a replace range",
          ),
      }),
    )
    .min(1),
});

/** Keeps a run-local copy and permits a small number of complete, validated revisions. */
export function createSummaryArtifact(initial: SummaryArtifact | null) {
  let draft = initial ? structuredClone(initial) : null;
  let writes = 0;
  const readHashlines = () => ({
    text: draft
      ? JSON.stringify(draft, null, 2)
          .split("\n")
          .map((line, index) => `${index + 1}#${lineHash(line)}:${line}`)
          .join("\n")
      : null,
  });
  const commit = (value: unknown) => {
    if (writes >= 3)
      throw new Error("Summary revision limit reached; finish with the current draft.");
    const validated = SummaryArtifactSchema.parse(value);
    draft = validated;
    writes += 1;
    return readHashlines();
  };
  return {
    read: () => ({ summary: draft ? structuredClone(draft) : null, changed: writes > 0 }),
    readHashlines,
    write(value: unknown) {
      if (draft)
        throw new Error("Summary already exists. Use read_summary and edit_summary to revise it.");
      return commit(value);
    },
    /** Validates all anchors against one snapshot and commits the complete edit batch atomically. */
    edit(value: z.infer<typeof SummaryEditSchema>) {
      const input = SummaryEditSchema.parse(value);
      if (!draft) throw new Error("Create the summary with write_summary before editing it.");
      const lines = JSON.stringify(draft, null, 2).split("\n");
      const edits = input.edits
        .map((edit) => {
          const start = resolveAnchor(edit.start, lines);
          const end = edit.end === null ? start : resolveAnchor(edit.end, lines);
          if (end < start) throw new Error("The end anchor must not precede the start anchor.");
          if (edit.lines.some((line) => /[\r\n]/.test(line)))
            throw new Error(
              "Each replacement entry must contain one physical line; escape newlines inside JSON strings.",
            );
          if (edit.op !== "replace" && edit.end !== null)
            throw new Error("Insertion edits require a null end anchor.");
          const offset = edit.op === "insert_after" ? start + 1 : start;
          return { offset, count: edit.op === "replace" ? end - start + 1 : 0, lines: edit.lines };
        })
        .sort((a, b) => a.offset - b.offset);
      for (let index = 1; index < edits.length; index++) {
        const previous = edits[index - 1];
        if (
          edits[index].offset === previous.offset ||
          edits[index].offset < previous.offset + previous.count
        ) {
          throw new Error("Summary edits overlap. Combine them into one replacement.");
        }
      }
      for (let index = edits.length - 1; index >= 0; index--) {
        const edit = edits[index];
        lines.splice(edit.offset, edit.count, ...edit.lines);
      }
      return commit(JSON.parse(lines.join("\n")));
    },
  };
}

/** Produces compact content anchors for validating the referenced lines. */
function lineHash(line: string): string {
  let hash = 2166136261;
  for (let index = 0; index < line.length; index++)
    hash = Math.imul(hash ^ line.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function resolveAnchor(anchor: string, lines: string[]): number {
  const match = /^([1-9]\d*)#([a-f0-9]{8})$/.exec(anchor);
  const index = match ? Number(match[1]) - 1 : -1;
  if (
    !match ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= lines.length ||
    lineHash(lines[index]) !== match[2]
  ) {
    throw new Error(
      `Stale or invalid hashline anchor: ${anchor}. Read the summary again before editing.`,
    );
  }
  return index;
}
