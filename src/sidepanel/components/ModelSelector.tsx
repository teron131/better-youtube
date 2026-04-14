/**
 * Reusable selector component for choosing AI models with icon and label.
 */

import {
	type ComboboxOption,
	EditableCombobox,
	findMatchingComboboxOption,
} from "@ui/components/ui/editable-combobox";
import { Brain, DollarSign, type LucideIcon, Rocket } from "lucide-react";
import { useMemo, useState } from "react";

type ModelSortMetric = "intelligence" | "speed" | "price";
type SortDirection = "asc" | "desc";

const MODEL_SORT_OPTIONS: Array<{
	metric: ModelSortMetric;
	icon: LucideIcon;
	label: string;
}> = [
	{ metric: "intelligence", icon: Brain, label: "Sort by intelligence" },
	{ metric: "speed", icon: Rocket, label: "Sort by speed" },
	{ metric: "price", icon: DollarSign, label: "Sort by price" },
];

function metricValue(option: ComboboxOption, metric: ModelSortMetric): number {
	if (metric === "price") {
		const value = option.price;
		return typeof value === "number" ? value : Number.POSITIVE_INFINITY;
	}

	const value =
		metric === "intelligence" ? option.intelligenceScore : option.speedScore;
	return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
}

function defaultSortDirection(metric: ModelSortMetric): SortDirection {
	return metric === "price" ? "asc" : "desc";
}

function formatMetricScore(
	option: ComboboxOption,
	metric: Exclude<ModelSortMetric, "price">,
): string | null {
	const rawValue =
		metric === "intelligence" ? option.intelligenceScore : option.speedScore;

	if (typeof rawValue !== "number") {
		return null;
	}

	const formattedValue =
		metric === "intelligence"
			? rawValue.toFixed(0)
			: rawValue >= 100
				? rawValue.toFixed(0)
				: rawValue.toFixed(1);

	return `[${formattedValue}]`;
}

function decorateOptionLabel(
	option: ComboboxOption,
	metric: ModelSortMetric,
): string {
	if (metric === "price") {
		return option.label;
	}

	const scoreLabel = formatMetricScore(option, metric);
	return scoreLabel ? `${option.label} ${scoreLabel}` : option.label;
}

function sortModelOptions(
	options: ComboboxOption[],
	metric: ModelSortMetric,
	direction: SortDirection,
): ComboboxOption[] {
	return [...options].sort((left, right) => {
		const leftValue = metricValue(left, metric);
		const rightValue = metricValue(right, metric);

		if (leftValue !== rightValue) {
			const ascendingResult = leftValue - rightValue;
			return direction === "asc" ? ascendingResult : -ascendingResult;
		}

		const labelComparison = left.label.localeCompare(right.label);
		return direction === "asc" ? labelComparison : -labelComparison;
	});
}

interface ModelSelectorProps {
	label: string;
	icon: LucideIcon;
	value: string;
	onChange: (value: string) => void;
	options: ComboboxOption[];
	placeholder: string;
	enableSorting?: boolean;
	defaultSortMetric?: ModelSortMetric;
}

export function ModelSelector({
	label,
	icon: Icon,
	value,
	onChange,
	options,
	placeholder,
	enableSorting = false,
	defaultSortMetric = "intelligence",
}: ModelSelectorProps) {
	const [sortMetric, setSortMetric] =
		useState<ModelSortMetric>(defaultSortMetric);
	const [sortDirection, setSortDirection] = useState<SortDirection>(
		defaultSortDirection(defaultSortMetric),
	);
	const sortedOptions = useMemo(
		() =>
			enableSorting
				? sortModelOptions(options, sortMetric, sortDirection)
				: options,
		[enableSorting, options, sortDirection, sortMetric],
	);
	const visibleOptions = useMemo(
		() =>
			enableSorting
				? sortedOptions.map((option) => ({
						...option,
						label: decorateOptionLabel(option, sortMetric),
					}))
				: sortedOptions,
		[enableSorting, sortedOptions, sortMetric],
	);
	const selectedOption = findMatchingComboboxOption(visibleOptions, value);

	const handleSortClick = (
		event: React.MouseEvent<HTMLButtonElement>,
		metric: ModelSortMetric,
	) => {
		event.preventDefault();
		event.stopPropagation();

		if (sortMetric === metric) {
			setSortDirection((currentDirection) =>
				currentDirection === "asc" ? "desc" : "asc",
			);
			return;
		}

		setSortMetric(metric);
		setSortDirection(defaultSortDirection(metric));
	};

	const renderModelOption = (option: ComboboxOption) => (
		<>
			{option.icon && (
				<span className="mr-2 flex items-center justify-center w-4 h-4">
					{option.icon}
				</span>
			)}
			<span>{option.label}</span>
		</>
	);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 group relative">
					<div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
						<Icon className="w-3 h-3 text-white" />
					</div>
					<span className="text-sm font-bold text-primary uppercase tracking-wide">
						{label}
					</span>
				</div>

				{enableSorting && (
					<div className="flex items-center rounded-lg border border-border/60 bg-background/40 p-0.5">
						{MODEL_SORT_OPTIONS.map(({ metric, icon: MetricIcon, label }) => (
							<button
								key={metric}
								type="button"
								onMouseDown={(event) => {
									event.preventDefault();
									event.stopPropagation();
								}}
								onClick={(event) => handleSortClick(event, metric)}
								className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
									sortMetric === metric
										? "bg-primary text-white"
										: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
								}`}
								aria-label={label}
								title={label}
							>
								<MetricIcon className="h-3.5 w-3.5" />
							</button>
						))}
					</div>
				)}
			</div>

			<EditableCombobox
				value={value}
				onChange={onChange}
				options={visibleOptions}
				placeholder={placeholder}
				renderOption={renderModelOption}
				renderIcon={() => selectedOption?.icon ?? null}
				inputClassName="bg-background/40 border-border/60 hover:border-primary/30 focus:border-primary/50 placeholder:text-muted-foreground"
			/>
		</div>
	);
}
