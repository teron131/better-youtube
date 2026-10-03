/** Model catalog entry shared by the model selectors, ranking metadata, and the cached catalog. */

import type { ModelModalities } from "./model-modalities";

export type AvailableModel = {
  key: string;
  label: string;
  provider?: string;
  recommended?: boolean;
  logo?: string;
  fallbackLogo?: string;
  intelligenceScore?: number | null;
  speedMetric?: number | null;
  price?: number | null;
  modalities?: ModelModalities;
};
