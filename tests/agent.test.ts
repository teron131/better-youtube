/** Exercises the real Agents SDK loop against a deterministic transport and checks artifact isolation. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

import { createSummaryArtifact } from "../src/core/agent/artifact.ts";

// Match Vite's raw Markdown imports while exercising the same bundled skill files in Node.
registerHooks({
  load(url, context, nextLoad) {
    if (url.includes("/src/core/agent/skills/") && url.endsWith("/SKILL.md?raw")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(readFileSync(new URL(url), "utf8"))};`,
      };
    }
    return nextLoad(url, context);
  },
});
const { runAgent } = await import("../src/core/agent/runtime.ts");
const { SKILLS } = await import("../src/core/agent/skills.ts");

test("skill metadata and instructions come from the Markdown files", () => {
  assert.deepEqual(
    SKILLS.map((skill) => skill.name),
    ["summary", "questions"],
  );
  assert.match(SKILLS[0].description, /chronological chapters/);
  assert.match(SKILLS[0].content, /write_summary/);
  assert.match(SKILLS[1].content, /Do not update the summary unless the user asks/);
});

const summary = {
  overview: "Solar panels convert sunlight to electricity.",
  chapters: [{ title: "Conversion", description: "The speaker explains photovoltaic cells." }],
};
const config = {
  llmApiKey: "test-key",
  llmBaseUrl: "https://test.invalid/v1",
  llmModelPrefixMode: "none" as const,
};
const input = {
  videoId: "VeizK1M7V7E",
  transcript: "Solar panels convert sunlight to electricity using photovoltaic cells.",
  model: "provider/test-model",
  summary: null,
  messages: [],
  prompt: "Summarize this video.",
};

test("agent creates, reads, and hashline-edits its artifact, then answers without editing", async () => {
  const originalFetch = globalThis.fetch;
  const editedSummary = {
    ...summary,
    overview: "Photovoltaic cells convert sunlight to electricity.",
  };
  const requests: any[] = [];
  const scripted: Array<{ tool?: string; args?: unknown; text?: string }> = [
    { tool: "read_skill", args: { name: "summary" } },
    { tool: "write_summary", args: summary },
    { tool: "read_summary", args: {} },
    { tool: "edit_summary" },
    { text: "The summary is ready." },
    { text: "Photovoltaic cells convert the sunlight, according to the transcript." },
  ];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    assert.equal(request.model, "test-model");
    const step = scripted.shift();
    assert.ok(step, "agent must stop within the expected loop");
    if (step.tool === "edit_summary") {
      const read = JSON.parse(request.messages.at(-1).content);
      const start = read.text
        .split("\n")
        .find((line: string) => line.includes('"overview"'))
        .split(":", 1)[0];
      step.args = {
        edits: [
          {
            op: "replace",
            start,
            end: null,
            lines: [`  "overview": ${JSON.stringify(editedSummary.overview)}`],
          },
        ],
      };
    }
    return Response.json({
      id: `completion-${requests.length}`,
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [
        {
          index: 0,
          finish_reason: step.tool ? "tool_calls" : "stop",
          message: step.tool
            ? {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `tool-${requests.length}`,
                    type: "function",
                    function: { name: step.tool, arguments: JSON.stringify(step.args) },
                  },
                ],
              }
            : { role: "assistant", content: step.text },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });
  };
  try {
    const first = await runAgent(input, config);
    assert.deepEqual(first.summary, editedSummary);
    assert.equal(first.summaryChanged, true);
    const next = await runAgent(
      {
        ...input,
        summary: first.summary,
        messages: first.messages,
        prompt: "What converts the sunlight?",
      },
      config,
    );
    assert.equal(next.summaryChanged, false);
    assert.deepEqual(next.summary, editedSummary);
    assert.equal(next.messages.length, 4);
    assert.ok(JSON.stringify(requests.at(-1).messages).includes("The summary is ready."));
    assert.ok(JSON.stringify(requests[0].messages).includes(input.transcript));
    assert.equal(scripted.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("artifact creation validates structure and exposes copies of the summary", () => {
  const original = structuredClone(summary);
  const artifact = createSummaryArtifact(null);
  assert.throws(() => artifact.write({ overview: "Missing chapters" }));
  assert.equal(artifact.read().changed, false);
  artifact.write({ ...summary, overview: "Edited" });
  assert.deepEqual(original, summary);
  const snapshot = artifact.read();
  snapshot.summary!.overview = "External mutation";
  assert.equal(artifact.read().summary!.overview, "Edited");
  assert.throws(() => artifact.write(summary), /already exists/);
});

test("a failed model continuation discards the run's draft changes", async () => {
  const originalFetch = globalThis.fetch;
  const initial = structuredClone(summary);
  const snapshot = createSummaryArtifact(initial).readHashlines();
  const start = snapshot
    .text!.split("\n")
    .find((line) => line.includes('"overview"'))!
    .split(":", 1)[0];
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls > 1)
      return Response.json(
        { error: { message: "Invalid model request", type: "invalid_request_error" } },
        { status: 400 },
      );
    return Response.json({
      id: "draft",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "write",
                type: "function",
                function: {
                  name: "edit_summary",
                  arguments: JSON.stringify({
                    edits: [
                      {
                        op: "replace",
                        start,
                        end: null,
                        lines: ['  "overview": "Uncommitted edit",'],
                      },
                    ],
                  }),
                },
              },
            ],
          },
        },
      ],
    });
  };
  try {
    await assert.rejects(
      runAgent({ ...input, summary: initial, prompt: "Edit the summary" }, config),
    );
    assert.deepEqual(initial, summary);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
