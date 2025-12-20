import type { FontSize } from "@/lib/constants";
import { DEFAULTS, FONT_SIZES, STORAGE_KEYS } from "@/lib/constants";
import { getStorageValue } from "@/lib/storage";

function setAnalysisCssVariables(size: FontSize): void {
  const config = FONT_SIZES.ANALYSIS[size] || FONT_SIZES.ANALYSIS[DEFAULTS.ANALYSIS_FONT_SIZE];

  document.documentElement.style.setProperty("--analysis-font-size-base", config.base);
  document.documentElement.style.setProperty("--analysis-font-size-h2", config.h2);
  document.documentElement.style.setProperty("--analysis-font-size-h3", config.h3);
}

export function applyAnalysisFontSize(size: FontSize): void {
  setAnalysisCssVariables(size);
}

export async function loadAnalysisFontSize(): Promise<void> {
  const storedSize =
    (await getStorageValue<FontSize>(STORAGE_KEYS.ANALYSIS_FONT_SIZE)) || DEFAULTS.ANALYSIS_FONT_SIZE;

  setAnalysisCssVariables(storedSize);
}
