/** Shared stats utility helpers adapted for the browser-side sidepanel. */

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
