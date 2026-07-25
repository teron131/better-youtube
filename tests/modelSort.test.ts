import assert from "node:assert/strict";
import test from "node:test";

import {
  decorateModelSortLabel,
  sortModelsByMetric,
  sortModelsByRankKey,
} from "../src/sidepanel/lib/model-sort.ts";

test("model sort puts scored rows first and falls back to price", () => {
  const rows = [
    { key: "z", label: "Z.ai: GLM", price: 1 },
    { key: "cheap", label: "Cheap model", price: 0.02 },
    { key: "strong", label: "Strong model", intelligenceScore: 80, price: 2 },
    { key: "okay", label: "Okay model", intelligenceScore: 40, price: 0.5 },
  ];

  assert.deepEqual(
    sortModelsByMetric(rows, "intelligence").map((row) => row.key),
    ["strong", "okay", "cheap", "z"],
  );
});

test("intelligence and speed sort by their own scores descending", () => {
  const rows = [
    {
      key: "smart",
      label: "Smart model",
      intelligenceScore: 95,
      speedMetric: 20,
      price: 1,
    },
    {
      key: "fast",
      label: "Fast model",
      intelligenceScore: 40,
      speedMetric: 99,
      price: 1,
    },
    {
      key: "middle",
      label: "Middle model",
      intelligenceScore: 70,
      speedMetric: 50,
      price: 1,
    },
  ];

  assert.deepEqual(
    sortModelsByMetric(rows, "intelligence").map((row) => row.key),
    ["smart", "middle", "fast"],
  );
  assert.deepEqual(
    sortModelsByMetric(rows, "speed").map((row) => row.key),
    ["fast", "middle", "smart"],
  );
});

test("rank-key sort uses the same score and fallback policy", () => {
  const rows = [
    { key: "slow", label: "Slow model", speedMetric: 20, price: 0.1 },
    { key: "missing", label: "Missing model", price: 0.01 },
    { key: "fast", label: "Fast model", speedMetric: 90, price: 1 },
  ];

  assert.deepEqual(
    sortModelsByRankKey(rows, "speedMetric").map((row) => row.key),
    ["fast", "slow", "missing"],
  );
});

test("model sort labels show scores only for scored metrics", () => {
  assert.equal(
    decorateModelSortLabel(
      { label: "OpenAI: GPT-5.4 Nano", intelligenceScore: 56.6 },
      "intelligence",
    ),
    "OpenAI: GPT-5.4 Nano [57]",
  );
  assert.equal(
    decorateModelSortLabel({ label: "OpenAI: GPT-5.4 Nano", price: 0.46 }, "price"),
    "OpenAI: GPT-5.4 Nano",
  );
});
