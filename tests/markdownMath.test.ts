/** Protects mixed Markdown math normalization without rewriting literal code examples. */

import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMathDelimiters } from "../src/sidepanel/lib/markdown-math.ts";

test("normalizes inline and display LaTeX while retaining existing dollar delimiters", () => {
  assert.equal(
    normalizeMathDelimiters(String.raw`Inline \(x^2\), $y$, and \[E=mc^2\].`),
    "Inline $x^2$, $y$, and \n\n$$\nE=mc^2\n$$\n\n.",
  );
});

test("keeps math delimiters inside inline and fenced code unchanged", () => {
  const examples = [String.raw`\(literal\)`, String.raw`\[literal\]`];
  for (const example of examples) {
    for (const fence of ["`", "```", "~~~"]) {
      const code = fence === "`" ? `${fence}${example}${fence}` : `${fence}\n${example}\n${fence}`;
      assert.equal(normalizeMathDelimiters(code), code);
    }
  }
});
