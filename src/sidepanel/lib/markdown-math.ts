/** Normalizes model-written math and protects prose prices while preserving literal code examples. */

const codePattern = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*(?:`|$))/g;
const mathOrCurrencyPattern = new RegExp(
  [
    /\\\[([\s\S]*?)\\\]/.source,
    /\\\((.*?)\\\)/.source,
    /(?<![\\$])\$\$[\s\S]*?\$\$/.source,
    // Inline equations need non-space inner edges and cannot close immediately before a price digit.
    /(?<![\\$])\$(?![\s$])(?:\\[^\n]|[^\\$\n])*?(?<!\s)\$(?![\d$])/.source,
    // Match currency last so dollar signs inside explicit equations remain untouched.
    /(?<![\\$])\$(?=\d)/.source,
  ].join("|"),
  "g",
);

/** "$5 and $x^2$" → "\$5 and $x^2$"; "\(a\)" → "$a$"; "\[c\]" becomes its own `$$` display block; code spans and fences pass through unchanged. */
export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(codePattern)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(mathOrCurrencyPattern, (match, display: string, inline: string) => {
        if (display !== undefined) return `\n\n$$\n${display.trim()}\n$$\n\n`;
        if (inline !== undefined) return `$${inline}$`;
        return match === "$" ? "\\$" : match;
      });
    })
    .join("");
}
