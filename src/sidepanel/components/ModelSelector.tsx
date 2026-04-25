/**
 * Reusable selector component for choosing AI models with icon and label.
 */

import {
	type ComboboxOption,
	EditableCombobox,
	findMatchingComboboxOption,
} from "@ui/components/ui/editable-combobox";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { Brain, DollarSign, type LucideIcon, Rocket } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

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
		metric === "intelligence" ? option.intelligenceScore : option.speedMetric;
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
		metric === "intelligence" ? option.intelligenceScore : option.speedMetric;

	if (typeof rawValue !== "number") {
		return null;
	}

	if (metric === "speed") {
		return `[${rawValue.toFixed(0)}]`;
	}

	const formattedValue = rawValue.toFixed(0);

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
	sortControlsTrailing?: ReactNode;
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
	sortControlsTrailing,
}: ModelSelectorProps) {
	const [sortMetric, setSortMetric] =
		useState<ModelSortMetric>(defaultSortMetric);
	const [sortDirection, setSortDirection] = useState<SortDirection>(
		defaultSortDirection(defaultSortMetric),
	);
	const effectiveSortMetric = MODEL_SORT_OPTIONS.some(
		({ metric }) => metric === sortMetric,
	)
		? sortMetric
		: (MODEL_SORT_OPTIONS[0]?.metric ?? sortMetric);
	const effectiveSortDirection =
		effectiveSortMetric === sortMetric
			? sortDirection
			: defaultSortDirection(effectiveSortMetric);
	const sortedOptions = useMemo(
		() =>
			enableSorting
				? sortModelOptions(options, effectiveSortMetric, effectiveSortDirection)
				: options,
		[effectiveSortDirection, effectiveSortMetric, enableSorting, options],
	);
	const visibleOptions = useMemo(
		() =>
			enableSorting
				? sortedOptions.map((option) => ({
						...option,
						label: decorateOptionLabel(option, effectiveSortMetric),
					}))
				: sortedOptions,
		[effectiveSortMetric, enableSorting, sortedOptions],
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
				<span className="mr-2 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
					{option.icon}
				</span>
			)}
			<span className="min-w-0 flex-1 whitespace-normal text-left">
				{option.label}
			</span>
		</>
	);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<div className="group relative flex min-h-9 min-w-0 flex-1 items-center gap-2">
					<Icon className="h-4 w-4 shrink-0 text-primary" />
					<span className="min-w-0 block text-sm font-semibold text-foreground">
						{label}
					</span>
				</div>

				{enableSorting && (
					<div className="ml-auto flex shrink-0 items-center rounded-md border border-border/60 bg-background/80 p-0.5">
						{MODEL_SORT_OPTIONS.map(({ metric, icon: MetricIcon, label }) => (
							<Tooltip key={metric} delayDuration={0}>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={(event) => handleSortClick(event, metric)}
										className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors sm:h-7 sm:w-7 ${
											effectiveSortMetric === metric
												? "bg-primary text-white"
												: "text-muted-foreground hover:bg-muted hover:text-foreground"
										}`}
										aria-label={label}
									>
										<MetricIcon className="h-3.5 w-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent>
									<p>{label}</p>
								</TooltipContent>
							</Tooltip>
						))}
						{sortControlsTrailing && (
							<div className="ml-1 flex items-center gap-1 border-l border-border/60 pl-1.5">
								{sortControlsTrailing}
							</div>
						)}
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
				inputClassName="rounded-md border-border/70 bg-background text-[13px] hover:border-primary/30 focus:border-primary/50 placeholder:text-muted-foreground sm:text-sm"
			/>
		</div>
	);
}
