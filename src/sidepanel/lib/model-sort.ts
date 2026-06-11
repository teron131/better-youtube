export type ModelSortMetric = "intelligence" | "speed" | "price";
export type ModelSortDirection = "asc" | "desc";
export type ModelRankKey = "intelligenceScore" | "speedMetric";

type SortableModel = {
	key?: string;
	label?: string;
	intelligenceScore?: number | null;
	speedMetric?: number | null;
	price?: number | null;
};

function finiteNumber(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreValue(
	model: SortableModel,
	metric: ModelSortMetric,
): number | null {
	if (metric === "price") {
		return finiteNumber(model.price);
	}

	return finiteNumber(
		metric === "intelligence" ? model.intelligenceScore : model.speedMetric,
	);
}

function priceValue(model: SortableModel): number {
	return finiteNumber(model.price) ?? Number.POSITIVE_INFINITY;
}

function labelValue(model: SortableModel): string {
	return model.label || model.key || "";
}

export function defaultModelSortDirection(
	metric: ModelSortMetric,
): ModelSortDirection {
	return metric === "price" ? "asc" : "desc";
}

export function metricForRankKey(key: ModelRankKey): ModelSortMetric {
	return key === "intelligenceScore" ? "intelligence" : "speed";
}

export function formatModelMetricScore(
	model: SortableModel,
	metric: Exclude<ModelSortMetric, "price">,
): string | null {
	const value = scoreValue(model, metric);
	return value == null ? null : `[${value.toFixed(0)}]`;
}

export function decorateModelSortLabel(
	model: SortableModel & { label: string },
	metric: ModelSortMetric,
): string {
	if (metric === "price") {
		return model.label;
	}

	const scoreLabel = formatModelMetricScore(model, metric);
	return scoreLabel ? `${model.label} ${scoreLabel}` : model.label;
}

export function sortModelsByMetric<T extends SortableModel>(
	models: T[],
	metric: ModelSortMetric,
	direction: ModelSortDirection = defaultModelSortDirection(metric),
): T[] {
	return [...models].sort((left, right) => {
		const leftScore = scoreValue(left, metric);
		const rightScore = scoreValue(right, metric);
		const leftHasScore = leftScore != null;
		const rightHasScore = rightScore != null;

		if (leftHasScore !== rightHasScore) {
			return leftHasScore ? -1 : 1;
		}

		if (leftScore != null && rightScore != null && leftScore !== rightScore) {
			const ascendingResult = leftScore - rightScore;
			return direction === "asc" ? ascendingResult : -ascendingResult;
		}

		const priceComparison = priceValue(left) - priceValue(right);
		if (priceComparison !== 0) {
			return priceComparison;
		}

		return labelValue(left).localeCompare(labelValue(right));
	});
}

export function sortModelsByRankKey<T extends SortableModel>(
	models: T[],
	key: ModelRankKey,
): T[] {
	return sortModelsByMetric(models, metricForRankKey(key), "desc");
}
