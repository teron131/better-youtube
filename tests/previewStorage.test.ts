/** Verifies preview storage persistence and Chrome-compatible notifications without a browser dependency. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../sidepanel-mock.js", import.meta.url), "utf8");
function preview(values: Map<string, string>) {
  const context: any = {
    console,
    TextEncoder,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  };
  context.window = context;
  runInNewContext(source, context);
  return context;
}

test("preview model cache survives reloads and emits storage changes", () => {
  const values = new Map<string, string>();
  const first = preview(values);
  let notifications = 0;
  const listener = (changes: any, area: string) => {
    assert.equal(area, "local");
    assert.equal(changes.dynamicModelsCache.newValue.models[0].key, "provider/model");
    notifications++;
  };
  first.chrome.storage.onChanged.addListener(listener);
  first.chrome.storage.local.set({ dynamicModelsCache: { models: [{ key: "provider/model" }] } });
  assert.equal(notifications, 1);
  first.chrome.storage.onChanged.removeListener(listener);
  const reloaded = preview(values);
  reloaded.chrome.storage.local.get(["dynamicModelsCache"], (result: any) =>
    assert.equal(result.dynamicModelsCache.models[0].key, "provider/model"),
  );
  reloaded.chrome.storage.local.remove("dynamicModelsCache");
  preview(values).chrome.storage.local.get(null, (result: any) =>
    assert.equal(Object.keys(result).length, 0),
  );
});

test("preview quota failures reach the callback instead of pretending the cache was saved", () => {
  const context = preview(new Map());
  context.localStorage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  let error: string | undefined;
  context.chrome.storage.local.set({ value: 1 }, () => {
    error = context.chrome.runtime.lastError?.message;
  });
  assert.match(error!, /Quota exceeded/);
  assert.equal(context.chrome.runtime.lastError, null);
});
