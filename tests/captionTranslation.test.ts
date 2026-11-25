/** Exercises caption refinement and translation through numbered-line requests to a stubbed model, without real model calls. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

import { REFINER_CONFIG } from "../src/core/constants.ts";
import type { SubtitleSegment } from "../src/core/storage.ts";

type CaptionRequest = {
  system: string;
  user: string;
  items: string[];
  before: string[];
  after: string[];
};
const requests: CaptionRequest[] = [];
let reply: (request: CaptionRequest, signal: AbortSignal) => Promise<string>;

Object.assign(globalThis, {
  captionModelBoundary: {
    invoke: async (messages: Array<{ content: string }>, { signal }: { signal: AbortSignal }) => {
      const request = parseRequest(messages[0].content, messages[1].content);
      requests.push(request);
      return { text: await reply(request, signal) };
    },
  },
});

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@langchain/openai") {
      return {
        url: new URL("caption-test-model.ts", import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/caption-test-model.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export class ChatOpenAI { invoke(...args) { return globalThis.captionModelBoundary.invoke(...args); } }",
      };
    }
    if (url.endsWith("/core/config.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const loadConfig = async () => ({ llmApiKey: 'test-key', llmModelPrefixMode: 'provider' });",
      };
    }
    if (url.endsWith("/core/clients/transport.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const isBrowserRuntime = () => false; export const createBrowserSafeOpenAiFetch = () => fetch;",
      };
    }
    return nextLoad(url, context);
  },
});

const { rewriteCaptions } = await import("../src/core/refiner/workflow.ts");

const video = { title: "Title", description: "Description" };
const hooks = () => ({ signal: new AbortController().signal });

beforeEach(() => {
  requests.length = 0;
  reply = async (request) => echo(request, (text) => text);
});

function parseRequest(system: string, user: string): CaptionRequest {
  const block = (tag: string) =>
    (user.match(new RegExp(`<${tag}[^>]*>\\n([\\s\\S]*?)\\n?</${tag}>`))?.[1] ?? "")
      .split("\n")
      .filter(Boolean);
  return {
    system,
    user,
    items: block("lines").map((line) => line.replace(/^\[LINE\d+\] /, "")),
    before: block("before"),
    after: block("after"),
  };
}

function echo(request: CaptionRequest, rewrite: (text: string, index: number) => string): string {
  return request.items
    .map((text, index) => `[LINE${index + 1}] ${rewrite(text, index)}`)
    .join("\n");
}

function sourceSegments(count: number): SubtitleSegment[] {
  return Array.from({ length: count }, (_, index) => ({
    text: `caption line ${index}`,
    startTime: index * 1000,
    endTime: (index + 1) * 1000,
    startTimeText: `original timestamp ${index}`,
  }));
}

test("refinement rewrites each line under its ID, ignores a label above the IDs, and keeps every timing field", async () => {
  reply = async (request) => `Here's the transcript:\n${echo(request, (text) => `${text}.`)}`;
  const source = sourceSegments(2);
  const output = await rewriteCaptions(source, video, "test-model", null, hooks());
  assert.deepEqual(
    output,
    source.map((segment) => ({ ...segment, text: `${segment.text}.` })),
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0].system, /^Correct YouTube transcript lines/);
  assert.match(requests[0].user, /^Title: Title\nDescription: Description\n/);
});

test("refinement keeps an original line whose reply is too unlike it to be a correction", async () => {
  reply = async (request) =>
    echo(request, (text, index) => (index === 0 ? "an unrelated sentence entirely" : `${text}!`));
  const output = await rewriteCaptions(sourceSegments(2), video, "test-model", null, hooks());
  assert.deepEqual(
    output.map((segment) => segment.text),
    ["caption line 0", "caption line 1!"],
  );
});

test("a missing ID merges that line into the previous line's time span when the reply reads as both", async () => {
  reply = async () => "[LINE1] caption line 0 caption line 1\n[LINE3] caption line 2";
  const source = sourceSegments(3);
  const output = await rewriteCaptions(source, video, "test-model", null, hooks());
  assert.deepEqual(output, [
    { ...source[0], endTime: source[1].endTime, text: "caption line 0 caption line 1" },
    source[2],
  ]);
});

test("translation names the target language in the system prompt and last in the request, and merges a missing ID", async () => {
  reply = async () => "[LINE1] 第一句\n[LINE2] 第二句";
  const source = sourceSegments(3);
  const output = await rewriteCaptions(source, video, "test-model", "zh-TW", hooks());
  assert.match(requests[0].system, /^Translate YouTube transcript lines .* in Traditional Chinese/);
  assert.match(
    requests[0].user,
    /Write every reply line in Traditional Chinese \(繁體中文\), whatever language or dialect the speech is in\.$/,
  );
  assert.deepEqual(output, [
    { ...source[0], text: "第一句" },
    { ...source[1], endTime: source[2].endTime, text: "第二句" },
  ]);
});

test("translation rejects a batch with no replies after three attempts instead of returning source text", async () => {
  reply = async () => "I cannot help with that.";
  await assert.rejects(
    rewriteCaptions(sourceSegments(2), video, "test-model", "en", hooks()),
    /Translation failed for lines 1-2 of 2/,
  );
  assert.equal(requests.length, 3);
});

test("refinement retries a 401 immediately and then keeps the original captions", async () => {
  reply = async () => {
    throw new Error("401 Unauthorized");
  };
  const started = Date.now();
  const output = await rewriteCaptions(sourceSegments(1), video, "test-model", null, hooks());
  assert.ok(Date.now() - started < 900, "401 must not wait between attempts");
  assert.equal(requests.length, 3);
  assert.deepEqual(output, sourceSegments(1));
});

test("an aborted refinement rejects without retrying or keeping original text, after reporting settled batches", async () => {
  const controller = new AbortController();
  const progress: Array<{ completedBatches: number; totalBatches: number }> = [];
  reply = (request, signal) =>
    requests.length === 1
      ? Promise.resolve(echo(request, (text) => text))
      : new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        });
  await assert.rejects(
    rewriteCaptions(
      sourceSegments(REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK + 1),
      video,
      "test-model",
      null,
      {
        signal: controller.signal,
        onProgress: (update) => {
          progress.push(update);
          controller.abort();
        },
      },
    ),
    { name: "AbortError" },
  );
  assert.deepEqual(progress, [{ completedBatches: 1, totalBatches: 2 }]);
  assert.equal(requests.length, 2);
});

test("concurrent batches see neighbouring lines as context and wait for all opening batches before priority delivery", async () => {
  const size = REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK;
  const source = sourceSegments(size * 3);
  const completed: number[] = [];
  let releaseFirst!: () => void;
  const firstWait = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  reply = async (request) => {
    const first = Number(request.items[0].split(" ").at(-1));
    if (first === 0) await firstWait;
    else if (first === size * 2) releaseFirst();
    completed.push(first);
    return echo(request, (text) => `${text}.`);
  };
  const partials: SubtitleSegment[][] = [];
  const output = await rewriteCaptions(source, video, "test-model", null, {
    ...hooks(),
    onPriorityComplete: (partial) => {
      assert.ok(completed.includes(0));
      partials.push(partial);
    },
  });
  assert.notEqual(completed[0], 0);
  assert.equal(partials.length, 1);
  // The opening window is the first half of this short video, which the first two batches cover.
  assert.deepEqual(partials[0], output.slice(0, size * 2));
  assert.deepEqual(
    output,
    source.map((segment) => ({ ...segment, text: `${segment.text}.` })),
  );
  const middle = requests.find((request) => request.items[0] === `caption line ${size}`)!;
  assert.deepEqual(
    middle.before,
    [size - 4, size - 3, size - 2, size - 1].map((index) => `caption line ${index}`),
  );
  assert.deepEqual(
    middle.after,
    [size * 2, size * 2 + 1, size * 2 + 2, size * 2 + 3].map((index) => `caption line ${index}`),
  );
});
