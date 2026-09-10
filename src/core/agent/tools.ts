/** Defines skill reading and summary editing tools bound to one run's artifact. */

import { tool } from "@openai/agents";
import { z } from "zod";

import {
  type createSummaryArtifact,
  SummaryArtifactSchema,
  SummaryEditSchema,
} from "./artifact.ts";
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
        "Read the summary as JSON lines tagged LINE#HASH:content. Copy these anchors for edit_summary.",
      parameters: z.object({}),
      execute: async () => JSON.stringify(artifact.readHashlines()),
    }),
    tool({
      name: "write_summary",
      description:
        "Create the initial summary artifact. Fails if one already exists; use edit_summary for revisions.",
      parameters: SummaryArtifactSchema,
      execute: async (summary) => JSON.stringify(artifact.write(summary)),
    }),
    tool({
      name: "edit_summary",
      description:
        "Apply targeted hashline edits to the summary JSON using LINE#HASH anchors from the latest read. All anchors refer to the same original read. Replacement ranges include both endpoints; inserts add raw lines before or after start. Empty replacement lines delete a range. The entire batch must produce valid summary JSON; stale or invalid edits change nothing. Returns refreshed hashlines.",
      parameters: SummaryEditSchema,
      execute: async (input) => JSON.stringify(artifact.edit(input)),
    }),
  ];
}
