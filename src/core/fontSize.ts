/** Owns percentage-based reading sizes and the one-time migration of saved preset values. */

import { FONT_SCALE, STORAGE_KEYS } from "./constants.ts";
import { setStorageValue } from "./storage.ts";

type FontSizeStorageKey =
  | typeof STORAGE_KEYS.CAPTION_FONT_SIZE
  | typeof STORAGE_KEYS.SUMMARY_FONT_SIZE;

const PRESET_SCALES = {
  [STORAGE_KEYS.CAPTION_FONT_SIZE]: { S: 80, M: 100, L: 120 },
  [STORAGE_KEYS.SUMMARY_FONT_SIZE]: { S: 90, M: 100, L: 110 },
} as const;

/** Snaps to the nearest step within the allowed range (104 → 100, 105 → 110); anything but a finite number, numeric strings included, becomes the default. */
export function normalizeFontScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return FONT_SCALE.DEFAULT;
  return Math.min(
    FONT_SCALE.MAX,
    Math.max(FONT_SCALE.MIN, Math.round(value / FONT_SCALE.STEP) * FONT_SCALE.STEP),
  );
}

/** Persists the normalized scale whenever the saved value differs from it, which migrates old S/M/L presets in place under the same storage key. */
export async function resolveStoredFontScale(
  key: FontSizeStorageKey,
  value: unknown,
): Promise<number> {
  const migrated =
    value === "S" || value === "M" || value === "L" ? PRESET_SCALES[key][value] : value;
  const scale = normalizeFontScale(migrated);
  if (value != null && value !== scale) await setStorageValue(key, scale);
  return scale;
}

/** Scales every caption constraint together, including the larger fullscreen presentation. */
export function getCaptionFontSizes(scale: number) {
  const factor = normalizeFontScale(scale) / FONT_SCALE.DEFAULT;
  return {
    base: scaleLength(1.8, factor, "vw"),
    max: scaleLength(28, factor),
    min: scaleLength(14, factor),
    fullscreen: scaleLength(2.2, factor, "vw"),
    fullscreenMax: scaleLength(36, factor),
  };
}

/** Keeps the default body/heading proportions at every summary and chat reading scale. */
export function getSummaryFontSizes(scale: number) {
  const factor = normalizeFontScale(scale) / FONT_SCALE.DEFAULT;
  return {
    base: scaleLength(18, factor),
    h2: scaleLength(26, factor),
    h3: scaleLength(22, factor),
  };
}

function scaleLength(value: number, factor: number, unit: "px" | "vw" = "px"): string {
  return `${Number((value * factor).toFixed(3))}${unit}`;
}
