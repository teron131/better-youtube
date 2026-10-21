/** Exercises indexed English translation batches, plus caption-correction fallbacks, through a stubbed model without real model calls. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

import { REFINER_CONFIG } from "../src/core/constants.ts";
import type { SubtitleSegment } from "../src/core/storage.ts";

type TranslationInput = {
  segments: Record<string, string>;
  precedingContext: Record<string, string>;
  followingContext: Record<string, string>;
};
const requests: TranslationInput[] = [];
let reply: (input: TranslationInput) => Promise<unknown>;
let correctionCalls = 0;
let correctionReply: () => Promise<unknown>;

Object.assign(globalThis, {
  translationTestBoundary: {
    invoke: async (messages: Array<{ content: string }>) => {
      if (messages[0].content.startsWith("Correct the segments")) {
        correctionCalls++;
        return correctionReply();
      }
      assert.match(messages[0].content, /Translate.*English/);
      const input = JSON.parse(messages[1].content) as TranslationInput;
      requests.push(input);
      return { parsed: await reply(input) };
    },
  },
});

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@langchain/openai") {
      return {
        url: new URL("translation-test-model.ts", import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/translation-test-model.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export class ChatOpenAI { withStructuredOutput() { return { invoke: (...args) => globalThis.translationTestBoundary.invoke(...args) }; } }",
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

const { refineTranscriptWithLLM, translateTranscriptWithLLM } =
  await import("../src/core/refiner/refiner.ts");

beforeEach(() => {
  requests.length = 0;
  reply = async (input) => englishTranslations(input);
  correctionCalls = 0;
});

const originalCaption: SubtitleSegment = {
  text: "hello world",
  startTime: 0,
  endTime: 1000,
  startTimeText: "0:00",
};

test("correction strips answer labels, so a label-only reply keeps the original caption", async () => {
  for (const label of [
    "Here's the transcript:",
    "Here is the transcript",
    "Here's transcript:",
    "Corrected transcript:",
    "Transcript:",
  ]) {
    correctionReply = async () => ({ parsed: { transcript: label } });
    const [segment] = await refineTranscriptWithLLM([originalCaption], "", "", "test-model");
    assert.equal(segment.text, "hello world", label);
  }

  correctionReply = async () => ({ parsed: { transcript: "the transcript shows a hello world" } });
  const [segment] = await refineTranscriptWithLLM([originalCaption], "", "", "test-model");
  assert.equal(segment.text, "the transcript shows a hello world");
});

test("correction retries a 401 immediately instead of backing off", async () => {
  correctionReply = async () => {
    throw new Error("401 Unauthorized");
  };
  const started = Date.now();
  const [segment] = await refineTranscriptWithLLM([originalCaption], "", "", "test-model");
  assert.ok(Date.now() - started < 900, "401 must not wait between attempts");
  assert.equal(correctionCalls, 3);
  assert.equal(segment.text, "hello world");
});

function englishTranslations(input: TranslationInput) {
  return {
    translations: Object.fromEntries(
      Object.keys(input.segments).map((key) => [key, `English ${key.slice(4)}`]),
    ),
  };
}

function sourceSegments(count: number): SubtitleSegment[] {
  return Array.from({ length: count }, (_, index) => ({
    text: `原文 ${index}`,
    startTime: index * 1000,
    endTime: (index + 1) * 1000,
    startTimeText: `original timestamp ${index}`,
  }));
}

test("English translation maps exact segment keys regardless of field order and preserves every timing field", async () => {
  reply = async (input) => ({
    translations: Object.fromEntries(
      Object.entries(englishTranslations(input).translations).reverse(),
    ),
  });
  const source = sourceSegments(2);
  const output = await translateTranscriptWithLLM(source, "Title", "Description", "test-model");
  assert.deepEqual(
    output,
    source.map((segment, index) => ({ ...segment, text: `English ${index}` })),
  );
  assert.deepEqual(source, sourceSegments(2));
  assert.equal(requests.length, 1);
});

for (const invalid of ["missing", "extra", "blank", "unparsed"]) {
  test(`translation rejects ${invalid} segment output after retries instead of returning source text`, async () => {
    reply = async (input) => {
      const response = englishTranslations(input);
      if (invalid === "missing") delete response.translations.line1;
      if (invalid === "extra") response.translations.line999 = "Extra content";
      if (invalid === "blank") response.translations.line0 = " ";
      return invalid === "unparsed" ? null : response;
    };
    await assert.rejects(
      translateTranscriptWithLLM(sourceSegments(2), "", "", "test-model"),
      /English translation failed for caption batch 1/,
    );
    assert.equal(requests.length, 3);
  });
}

test("concurrent batches retain global indexes and wait for all opening batches before priority delivery", async () => {
  const source = sourceSegments(REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK * 3);
  const completed: number[] = [];
  let releaseFirst!: () => void;
  const firstWait = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  reply = async (input) => {
    const startIndex = Number(Object.keys(input.segments)[0].slice(4));
    if (startIndex === 0) await firstWait;
    else if (startIndex === REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK * 2) releaseFirst();
    completed.push(startIndex);
    return englishTranslations(input);
  };
  const partials: SubtitleSegment[][] = [];
  const output = await translateTranscriptWithLLM(source, "", "", "test-model", (partial) => {
    assert.ok(completed.includes(0));
    partials.push(partial);
  });
  assert.notEqual(completed[0], 0);
  assert.equal(partials.length, 1);
  assert.deepEqual(partials[0], output.slice(0, source.length / 2));
  assert.deepEqual(
    output,
    source.map((segment, index) => ({ ...segment, text: `English ${index}` })),
  );
  assert.deepEqual(requests[1].precedingContext, { line28: "原文 28", line29: "原文 29" });
  assert.deepEqual(requests[1].followingContext, { line60: "原文 60", line61: "原文 61" });
  assert.deepEqual(requests[0].precedingContext, {});
  assert.deepEqual(requests[2].followingContext, {});
  assert.equal(
    output.length,
    source.length,
    "neighboring context must never become extra output segments",
  );
});

test("translation rejects neighboring context keys in the output", async () => {
  reply = async (input) => ({
    translations: {
      ...englishTranslations(input).translations,
      ...Object.fromEntries(
        Object.keys(input.precedingContext)
          .concat(Object.keys(input.followingContext))
          .map((key) => [key, "Unrequested context"]),
      ),
    },
  });
  await assert.rejects(
    translateTranscriptWithLLM(sourceSegments(31), "", "", "test-model"),
    /English translation failed for caption batch/,
  );
  assert.ok(
    requests.every(
      (request) => Object.keys(request.segments).length <= REFINER_CONFIG.MAX_SEGMENTS_PER_CHUNK,
    ),
  );
});
