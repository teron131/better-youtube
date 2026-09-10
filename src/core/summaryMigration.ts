/** Converts the retired structured storage format to Markdown once at the storage boundary. */

export function migrateSummaryText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (!value || typeof value !== "object") return null;
  const stored = value as { overview?: unknown; chapters?: unknown };
  const parts: string[] = [];
  if (typeof stored.overview === "string" && stored.overview.trim())
    parts.push(stored.overview.trim());
  if (Array.isArray(stored.chapters)) {
    for (const chapter of stored.chapters) {
      if (!chapter || typeof chapter !== "object") continue;
      const title = typeof chapter.title === "string" ? chapter.title.trim() : "";
      const description = typeof chapter.description === "string" ? chapter.description.trim() : "";
      if (!title && !description) continue;
      const times = [chapter.startTime, chapter.endTime].filter(
        (time) => typeof time === "string" && time.trim(),
      );
      const range = times.length ? ` (${times.join("–")})` : "";
      parts.push(`## ${title || "Chapter"}${range}${description ? `\n\n${description}` : ""}`);
    }
  }
  return parts.join("\n\n") || null;
}
