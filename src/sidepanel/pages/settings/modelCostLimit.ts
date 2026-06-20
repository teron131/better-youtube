import type { ModelCostLimitBounds, PriceRange } from "./settingsTypes";

export function clampModelCostLimit(
	value: number,
	priceRange: PriceRange,
): number {
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

export function resolveVisibleModelKey(
	currentKey: string,
	visibleModels: Array<{ key: string }>,
	fallbackKey: string,
): string {
	if (visibleModels.some((model) => model.key === currentKey)) {
		return currentKey;
	}

	if (visibleModels.some((model) => model.key === fallbackKey)) {
		return fallbackKey;
	}

	return visibleModels[0]?.key ?? currentKey;
}

export function modelCostLimitBounds(
	priceRange: PriceRange,
): ModelCostLimitBounds {
	return {
		min: priceRange.min != null ? priceRange.min.toFixed(1) : "0.1",
		max: priceRange.max != null ? priceRange.max.toFixed(1) : undefined,
	};
}
