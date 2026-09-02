/** Defines numeric bounds for model-list cost filters without changing selections. */

import type { ModelCostLimitBounds, PriceRange } from "./settingsTypes";

export function clampModelCostLimit(value: number, priceRange: PriceRange): number {
  const minValue = priceRange.min;
  const maxValue = priceRange.max;

  if (minValue != null && value < minValue) {
    return minValue;
  }

  if (maxValue != null && value > maxValue) {
    return maxValue;
  }

  return value;
}

export function modelCostLimitBounds(priceRange: PriceRange): ModelCostLimitBounds {
  return {
    min: priceRange.min != null ? priceRange.min.toFixed(1) : "0.1",
    max: priceRange.max != null ? priceRange.max.toFixed(1) : undefined,
  };
}
