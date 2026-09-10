/** Renders assistant and summary prose with Markdown, tables, code, and locally bundled KaTeX. */

import { createMathPlugin } from "@streamdown/math";
import { Streamdown } from "streamdown";

import { normalizeMathDelimiters } from "../lib/markdown-math.ts";

import "katex/dist/katex.min.css";

const plugins = { math: createMathPlugin({ singleDollarTextMath: true }) };

export function Markdown({ children }: { children: string }) {
  return (
    <Streamdown mode="static" plugins={plugins} controls={false} className="chat-markdown">
      {normalizeMathDelimiters(children)}
    </Streamdown>
  );
}
