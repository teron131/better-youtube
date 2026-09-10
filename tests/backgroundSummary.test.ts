/** Exercises summary messages, provider fallback, and storage policy with deterministic model boundaries. */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

import { VideoWorkloadLifecycle } from "../src/background/workloads.ts";
import { MESSAGE_ACTIONS, STORAGE, STORAGE_KEYS } from "../src/core/constants.ts";

const local: Record<string, any> = {};
const session: Record<string, any> = {};
const notifications: any[] = [];
let bytesUsed = 0;
const summary = { overview: "Grounded overview", chapters: [] };
let agentCalls = 0;
let nativeCalls = 0;
let agentReply = async () => ({ summary });
let nativeReply = async () => ({ summary });

function storageArea(items: Record<string, any>) {
  return {
    get(keys: string[] | null, callback: (value: Record<string, any>) => void) {
      callback(
        keys === null
          ? { ...items }
          : Object.fromEntries(keys.filter((key) => key in items).map((key) => [key, items[key]])),
      );
    },
    set(values: Record<string, unknown>, callback: () => void) {
      Object.assign(items, values);
      callback();
    },
    remove(keys: string[], callback: () => void) {
      keys.forEach((key) => delete items[key]);
      callback();
    },
    getBytesInUse(_keys: unknown, callback: (value: number) => void) {
      callback(bytesUsed);
    },
  };
}

Object.assign(globalThis, {
  chrome: {
    storage: { local: storageArea(local), session: storageArea(session) },
    runtime: {
      sendMessage(payload: unknown, callback?: () => void) {
        notifications.push(payload);
        callback?.();
        return Promise.resolve();
      },
    },
  },
  backendTestModels: {
    runAgent: async () => {
      agentCalls++;
      return agentReply();
    },
    summarizeGemini: async () => {
      nativeCalls++;
      return nativeReply();
    },
  },
});

// Replace only paid inference; routing, source lookup, persistence, and messages execute production code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/"))
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (
      specifier.startsWith("./") &&
      !specifier.endsWith(".ts") &&
      context.parentURL?.includes("/src/background/")
    )
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/core/agent/runtime.ts"))
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const runAgent = (...args) => globalThis.backendTestModels.runAgent(...args);",
      };
    if (url.endsWith("/background/nativeSummary.ts"))
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export const summarizeGemini = (...args) => globalThis.backendTestModels.summarizeGemini(...args);",
      };
    return nextLoad(url, context);
  },
});

const { handleGenerateSummary } = await import("../src/background/summary.ts");
const { clearStoredDataExceptSettings, setStorageValue, saveSummary } =
  await import("../src/core/storage.ts");
const videoId = "abcdefghijk";
const config = {
  llmApiKey: "test-key",
  geminiApiKey: "test-key",
  summarizerModel: "test-model",
  summarizerProvider: "llm",
};

beforeEach(() => {
  for (const key of Object.keys(local)) delete local[key];
  for (const key of Object.keys(session)) delete session[key];
  notifications.length = 0;
  bytesUsed = 0;
  agentCalls = nativeCalls = 0;
  agentReply = async () => ({ summary });
  nativeReply = async () => ({ summary });
  local[`video_info_${videoId}`] = {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: "Test video",
  };
});

async function request(
  overrides: Record<string, unknown> = {},
  workloads = new VideoWorkloadLifecycle(),
) {
  const responses: unknown[] = [];
  await handleGenerateSummary(
    {
      action: MESSAGE_ACTIONS.GENERATE_SUMMARY,
      videoId,
      requestId: "request",
      transcript: "Source transcript",
      targetLanguage: "English",
      ...overrides,
    },
    { config: config as any, summaryWorkloads: workloads, tabId: 7 },
    (response) => responses.push(response),
  );
  assert.deepEqual(responses, [{ status: "processing" }]);
}

test("summary messages persist final artifacts and reuse only matching cache entries", async () => {
  await request();
  assert.equal(agentCalls, 1);
  assert.deepEqual(local[`summary_${videoId}`].summary, summary);
  assert.equal(local[`summary_${videoId}`].modelUsed, "llm::test-model");
  assert.equal(local[`summary_${videoId}`].targetLanguage, "English");
  assert.equal(typeof local[`video_meta_${videoId}`].updatedAt, "number");
  assert.equal(notifications[0].transcript, "Source transcript");
  await request();
  assert.equal(agentCalls, 1);
  assert.equal(notifications[1].summary.iterations, 0);
  assert.equal(notifications[1].transcript, null);
  await request({ targetLanguage: "French" });
  assert.equal(agentCalls, 2);
  await request({ targetLanguage: "French", forceRegenerate: true });
  assert.equal(agentCalls, 3);
});

test("native Gemini failure falls back to the agent and records the actual provider", async () => {
  nativeReply = async () => {
    throw new Error("native unavailable");
  };
  await request({ summarizerProvider: "gemini", modelSelection: "gemini-test" });
  assert.equal(nativeCalls, 1);
  assert.equal(agentCalls, 1);
  assert.equal(local[`summary_${videoId}`].modelUsed, "llm::gemini-test");
  assert.equal(notifications[0].provider, "llm");
});

test("provider failure emits an error and leaves the existing summary intact", async () => {
  const previous = {
    summary: { overview: "Previous", chapters: [] },
    timestamp: 1,
    modelUsed: "old-model",
  };
  local[`summary_${videoId}`] = previous;
  agentReply = async () => {
    throw new Error("agent failed");
  };
  await request();
  assert.deepEqual(local[`summary_${videoId}`], previous);
  assert.equal(notifications[0].action, MESSAGE_ACTIONS.SHOW_ERROR);
});

test("a superseded summary job cannot persist or broadcast its result", async () => {
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  agentReply = async () => {
    started();
    await pending;
    return { summary };
  };
  const workloads = new VideoWorkloadLifecycle();
  const running = request({}, workloads);
  await entered;
  workloads.begin({ videoId, requestId: "newer", workloadKey: "different" });
  release();
  await running;
  assert.equal(local[`summary_${videoId}`], undefined);
  assert.equal(notifications.length, 0);
});

test("cache eviction removes complete old video groups while preserving settings", async () => {
  local[STORAGE_KEYS.LLM_API_KEY] = "saved-key";
  for (let index = 0; index < 12; index++) {
    const id = String(index).padStart(11, "0");
    local[id] = [{ text: "caption" }];
    local[`video_info_${id}`] = { title: "Video" };
    local[`summary_${id}`] = { summary, timestamp: index + 1 };
    local[`video_meta_${id}`] = { updatedAt: index + 1 };
  }
  bytesUsed = STORAGE.QUOTA_BYTES;
  await setStorageValue(STORAGE_KEYS.LLM_API_KEY, "updated-key");
  assert.equal(local[STORAGE_KEYS.LLM_API_KEY], "updated-key");
  assert.equal(local["00000000000"], undefined);
  assert.equal(local["summary_00000000000"], undefined);
  assert.equal(local["video_info_00000000000"], undefined);
  assert.equal(local["video_meta_00000000000"], undefined);
  assert.ok(local["summary_00000000011"]);
});

test("clear saved data retains settings and clears only owned session data", async () => {
  local[STORAGE_KEYS.LLM_API_KEY] = "saved-key";
  await saveSummary(videoId, summary, "llm::test-model", "English");
  session[STORAGE_KEYS.FILTERED_VIDEOS] = [videoId];
  session.unrelated = "keep";
  const result = await clearStoredDataExceptSettings();
  assert.deepEqual(local, { [STORAGE_KEYS.LLM_API_KEY]: "saved-key" });
  assert.deepEqual(session, { unrelated: "keep" });
  assert.equal(result.localKeysRemoved, 3);
  assert.equal(result.sessionKeysRemoved, 1);
});
