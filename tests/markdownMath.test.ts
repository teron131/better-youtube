/** Protects mixed Markdown math normalization without rewriting literal code examples. */

import assert from "node:assert/strict";
import test from "node:test";

import { createMathPlugin } from "@streamdown/math";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";

import { normalizeMathDelimiters } from "../src/sidepanel/lib/markdown-math.ts";

test("normalizes inline and display LaTeX while retaining existing dollar delimiters", () => {
  assert.equal(
    normalizeMathDelimiters(String.raw`Inline \(x^2\), $y$, and \[E=mc^2\].`),
    "Inline $x^2$, $y$, and \n\n$$\nE=mc^2\n$$\n\n.",
  );
});

test("keeps math delimiters inside inline and fenced code unchanged", () => {
  const examples = [String.raw`\(literal\)`, String.raw`\[literal\]`, "$2 and $10"];
  for (const example of examples) {
    for (const fence of ["`", "```", "~~~"]) {
      const code = fence === "`" ? `${fence}${example}${fence}` : `${fence}\n${example}\n${fence}`;
      assert.equal(normalizeMathDelimiters(code), code);
    }
  }
});

test("protects summary prices from being interpreted as inline equations", () => {
  const prices =
    "Argon launched at an introductory price of **$2 per million input tokens and $10 per million output tokens**, scheduled to rise to **$4/$20 on December 1**.";
  assert.equal(normalizeMathDelimiters(prices), prices.replaceAll("$", "\\$"));
  const html = renderToStaticMarkup(
    createElement(Streamdown, {
      mode: "static",
      plugins: { math: createMathPlugin({ singleDollarTextMath: true }) },
      controls: false,
      children: normalizeMathDelimiters(prices),
    }),
  );
  assert.ok(!html.includes("katex"));
  assert.ok(html.includes(">$2 per million input tokens and $10 per million output tokens</span>"));
  assert.ok(html.includes(">$4/$20 on December 1</span>"));
});

test("preserves equations and escaped currency alongside prose prices", () => {
  const markdown = String.raw`Pay $2 or $10. Math: $2 + 2$, $x$, \(2x\), $$2x$$, and \[2x\]. Already escaped: \$4/\$20.`;
  assert.equal(
    normalizeMathDelimiters(markdown),
    "Pay \\$2 or \\$10. Math: $2 + 2$, $x$, $2x$, $$2x$$, and \n\n$$\n2x\n$$\n\n. Already escaped: \\$4/\\$20.",
  );
});
