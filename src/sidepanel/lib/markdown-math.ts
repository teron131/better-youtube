/** Normalizes model-written LaTeX delimiters while preserving fenced and inline code examples. */

const codePattern = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*(?:`|$))/g;

export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(codePattern)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
        .replace(/\\\((.*?)\\\)/g, (_match, math: string) => `$${math}$`);
    })
    .join("");
}
