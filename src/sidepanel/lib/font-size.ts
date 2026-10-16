/** Applies the saved summary reading scale through the sidepanel's CSS variables. */

import { STORAGE_KEYS } from "@/core/constants";
import { getSummaryFontSizes, resolveStoredFontScale } from "@/core/fontSize";
import { getStorageValue } from "@/core/storage";

export function applySummaryFontSize(scale: number): void {
  const config = getSummaryFontSizes(scale);

  document.documentElement.style.setProperty("--summary-font-size-base", config.base);
  document.documentElement.style.setProperty("--summary-font-size-h2", config.h2);
  document.documentElement.style.setProperty("--summary-font-size-h3", config.h3);
}

/** Resolves persisted reading preferences before the first summary is displayed. */
export async function loadSummaryFontSize(): Promise<void> {
  const storedScale = await getStorageValue<unknown>(STORAGE_KEYS.SUMMARY_FONT_SIZE);
  const scale = await resolveStoredFontScale(STORAGE_KEYS.SUMMARY_FONT_SIZE, storedScale);

  applySummaryFontSize(scale);
}
