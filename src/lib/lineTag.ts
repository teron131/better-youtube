import { z } from "zod";

export const TagRangeSchema = z.object({
  start_tag: z.string().describe("The starting line tag, e.g., [L10]"),
  end_tag: z.string().describe("The ending line tag, e.g., [L20]"),
});

export type TagRange = z.infer<typeof TagRangeSchema>;

export const GarbageIdentificationSchema = z.object({
  garbage_ranges: z
    .array(TagRangeSchema)
    .describe("List of line ranges identified as promotional or irrelevant content"),
});

export type GarbageIdentification = z.infer<typeof GarbageIdentificationSchema>;

export function tagContent(text: string): string {
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => `[L${index + 1}] ${line}`).join("\n");
}

export function untagContent(text: string): string {
  return text.replace(/^\[L\d+\]\s*/gm, "");
}

export function filterContent(taggedText: string, ranges: TagRange[]): string {
  const lines = taggedText.split(/\r?\n/);
  if (!lines.length || !ranges.length) {
    return taggedText;
  }

  const tagToIndex = new Map<string, number>();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\[L\d+\]/);
    if (match) {
      tagToIndex.set(match[0], index);
    }
  }

  const keepMask = new Array(lines.length).fill(true);

  for (const range of ranges) {
    const startIndex = tagToIndex.get(range.start_tag);
    const endIndex = tagToIndex.get(range.end_tag);
    if (startIndex === undefined || endIndex === undefined) {
      continue;
    }
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    for (let i = start; i <= end; i += 1) {
      keepMask[i] = false;
    }
  }

  return lines.filter((_, index) => keepMask[index]).join("\n");
}
