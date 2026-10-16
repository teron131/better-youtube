/** Protects saved reading preferences across the preset migration and scaling beyond the old three sizes. */

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { loadConfig } from "../src/core/config.ts";
import { STORAGE_KEYS } from "../src/core/constants.ts";
import {
  getCaptionFontSizes,
  getSummaryFontSizes,
  normalizeFontScale,
  resolveStoredFontScale,
} from "../src/core/fontSize.ts";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const stored = new Map<string, string>();
let writes = 0;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
      writes++;
    },
    removeItem: (key: string) => stored.delete(key),
  },
});
beforeEach(() => {
  stored.clear();
  writes = 0;
});
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("config migrates saved presets once and retains independent numeric adjustments", async () => {
  for (const [preset, caption, summary] of [
    ["S", 80, 90],
    ["M", 100, 100],
    ["L", 120, 110],
  ] as const) {
    stored.set(STORAGE_KEYS.CAPTION_FONT_SIZE, JSON.stringify(preset));
    stored.set(STORAGE_KEYS.SUMMARY_FONT_SIZE, JSON.stringify(preset));
    const config = await loadConfig();
    assert.equal(config.captionFontSize, caption);
    assert.equal(config.summaryFontSize, summary);
    assert.equal(stored.get(STORAGE_KEYS.CAPTION_FONT_SIZE), String(caption));
    assert.equal(stored.get(STORAGE_KEYS.SUMMARY_FONT_SIZE), String(summary));
  }
  assert.equal(writes, 6);

  stored.set(STORAGE_KEYS.CAPTION_FONT_SIZE, "150");
  stored.set(STORAGE_KEYS.SUMMARY_FONT_SIZE, "70");
  const config = await loadConfig();
  assert.equal(config.captionFontSize, 150);
  assert.equal(config.summaryFontSize, 70);
  assert.equal(writes, 6, "valid numeric preferences should not trigger migration writes");
});

test("invalid stored scales are repaired while missing preferences use the default without a write", async () => {
  assert.equal(await resolveStoredFontScale(STORAGE_KEYS.CAPTION_FONT_SIZE, null), 100);
  assert.equal(writes, 0);
  assert.equal(await resolveStoredFontScale(STORAGE_KEYS.CAPTION_FONT_SIZE, -20), 50);
  assert.equal(stored.get(STORAGE_KEYS.CAPTION_FONT_SIZE), "50");
  assert.equal(await resolveStoredFontScale(STORAGE_KEYS.SUMMARY_FONT_SIZE, 900), 200);
  assert.equal(stored.get(STORAGE_KEYS.SUMMARY_FONT_SIZE), "200");
  assert.equal(normalizeFontScale(Number.NaN), 100);
  assert.equal(normalizeFontScale("large"), 100);
});

test("scaling preserves the default and scales body, headings, and fullscreen captions together", () => {
  assert.deepEqual(getSummaryFontSizes(100), { base: "18px", h2: "26px", h3: "22px" });
  assert.deepEqual(getCaptionFontSizes(100), {
    base: "1.8vw",
    max: "28px",
    min: "14px",
    fullscreen: "2.2vw",
    fullscreenMax: "36px",
  });
  assert.deepEqual(getSummaryFontSizes(150), { base: "27px", h2: "39px", h3: "33px" });
  assert.deepEqual(getCaptionFontSizes(150), {
    base: "2.7vw",
    max: "42px",
    min: "21px",
    fullscreen: "3.3vw",
    fullscreenMax: "54px",
  });
});
