import type { FontSize } from "@/lib/constants";
import { DEFAULTS, FONT_SIZES, STORAGE_KEYS } from "@/lib/constants";
import { getStorageValue } from "@/lib/storage";

function setSummaryCssVariables(size: FontSize): void {
  const config = FONT_SIZES.SUMMARY[size] || FONT_SIZES.SUMMARY[DEFAULTS.SUMMARY_FONT_SIZE];

  document.documentElement.style.setProperty("--summary-font-size-base", config.base);
  document.documentElement.style.setProperty("--summary-font-size-h2", config.h2);
  document.documentElement.style.setProperty("--summary-font-size-h3", config.h3);
}

export function applySummaryFontSize(size: FontSize): void {
  setSummaryCssVariables(size);
}

export async function loadSummaryFontSize(): Promise<void> {
  const storedSize =
    (await getStorageValue<FontSize>(STORAGE_KEYS.SUMMARY_FONT_SIZE)) || DEFAULTS.SUMMARY_FONT_SIZE;

  setSummaryCssVariables(storedSize);
}
