/** Defines skill reading and summary editing tools bound to one run's artifact. */

import { tool } from "@openai/agents";
import { z } from "zod";

import { type createSummaryArtifact, SummaryEditSchema, SummaryTextSchema } from "./artifact.ts";
import { SKILLS } from "./skills.ts";

/** Binds tools to the current draft so concurrent runs never share mutable artifacts. */
export function createTools(artifact: ReturnType<typeof createSummaryArtifact>) {
  return [
    tool({
      name: "read_skill",
      description: "Load guidance for the current task.",
      parameters: z.object({
        name: z.enum(SKILLS.map((skill) => skill.name) as [string, ...string[]]),
      }),
      execute: async ({ name }) => SKILLS.find((skill) => skill.name === name)!.content,
    }),
    tool({
      name: "read_summary",
      description:
        "Read the Markdown summary as lines tagged LINE#HASH:content. Copy these anchors for edit_summary.",
      parameters: z.object({}),
      execute: async () => JSON.stringify(artifact.readHashlines()),
    }),
    tool({
      name: "write_summary",
      description:
        "Create the initial summary artifact. Fails if one already exists; use edit_summary for revisions.",
      parameters: z.object({
        text: SummaryTextSchema.describe("The complete summary as Markdown text."),
      }),
      execute: async ({ text }) => JSON.stringify(artifact.write(text)),
    }),
    tool({
      name: "edit_summary",
      description:
        "Edit the Markdown summary using LINE#HASH anchors from the latest read. All anchors refer to the same snapshot. Replacement ranges include both endpoints; inserts add lines before or after start. Empty replacement lines delete a range. Stale, overlapping, or empty-summary edits change nothing. Returns refreshed hashlines.",
      parameters: SummaryEditSchema,
      execute: async (input) => JSON.stringify(artifact.edit(input)),
    }),
  ];
}
