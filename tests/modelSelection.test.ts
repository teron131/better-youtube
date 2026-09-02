/** Protects model identifier normalization shared by configuration and model catalogs. */

import assert from "node:assert/strict";
import test from "node:test";

import { isBatchModelVariant, normalizeModelSelection } from "../src/core/config.ts";

test("batch model selections migrate to their normal model", () => {
  assert.equal(isBatchModelVariant("anthropic/claude-opus-5:batch"), true);
  assert.equal(normalizeModelSelection("anthropic/claude-opus-5:batch"), "anthropic/claude-opus-5");
  assert.equal(normalizeModelSelection(" openai/gpt-5.6-luna "), "openai/gpt-5.6-luna");
  assert.equal(isBatchModelVariant("openai/gpt-5.6-luna"), false);
});
