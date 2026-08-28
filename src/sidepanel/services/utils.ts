/** Shared model-stat value, concurrency, parsing, and optional-fetch policies for the browser sidepanel. */

export type JsonObject = Record<string, unknown>;
export type NumberOrNull = number | null;

export function asRecord(value: unknown): JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function asFiniteNumber(value: unknown): NumberOrNull {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function firstNumber(object: JsonObject | undefined, keys: string[]): NumberOrNull {
  if (!object) return null;
  for (const key of keys) {
    const value = asFiniteNumber(object[key]);
    if (value != null) return value;
  }
  return null;
}

export function firstString(object: JsonObject | undefined, keys: string[]): string | null {
  if (!object) return null;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseJsonObject(value: string): JsonObject {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

/** Map an external-source cohort with bounded concurrency while preserving input order. */
export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const output = new Array<Output>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await mapper(values[index] as Input);
      }
    }),
  );
  return output;
}

/** Fetch an optional public source once with an explicit timeout and null degradation. */
export async function fetchRemoteText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
