/** Formats caption timestamps, upload dates, and video durations for display. */

/** 65_000 → "1:05". */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Accepts YouTube's compact `20240105` upload dates as well as ISO date strings. */
export function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(dateStr);
  const isoDate = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : dateStr;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return dateStr;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: compact ? "long" : "short",
    day: "numeric",
    // Date-only strings parse as UTC midnight, so reading them in UTC keeps their calendar day in every timezone.
    ...(/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? { timeZone: "UTC" } : {}),
  });
}

/** Drops a zero hour field ("00:45:30" → "45:30"); nonzero hours such as "01:45:30" stay as they are. */
export function trimLeadingZeros(duration?: string | null): string | null {
  if (!duration) return null;
  return duration.replace(/^0{1,2}:/, "");
}
