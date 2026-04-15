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
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

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
	const [stackControls, setStackControls] = useState(false);
	const headerRef = useRef<HTMLDivElement>(null);
	const controlsRef = useRef<HTMLDivElement>(null);
	const titleRef = useRef<HTMLSpanElement>(null);
	const availableSortOptions = MODEL_SORT_OPTIONS;
	const effectiveSortMetric = availableSortOptions.some(
		({ metric }) => metric === sortMetric,
	)
		? sortMetric
		: (availableSortOptions[0]?.metric ?? sortMetric);
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

	useEffect(() => {
		if (!enableSorting) {
			setStackControls(false);
			return;
		}

		const titleElement = titleRef.current;
		const headerElement = headerRef.current;
		const controlsElement = controlsRef.current;
		if (!titleElement || !headerElement || !controlsElement) {
			return;
		}

		const updateStackedLayout = () => {
			const computedStyle = window.getComputedStyle(titleElement);
			const canvas = document.createElement("canvas");
			const context = canvas.getContext("2d");
			if (!context) {
				return;
			}

			context.font = computedStyle.font;
			const letterSpacing =
				Number.parseFloat(computedStyle.letterSpacing || "0") || 0;
			const textWidth =
				context.measureText(label).width +
				Math.max(label.length - 1, 0) * letterSpacing;
			const iconAndGapWidth = 24 + 8;
			const controlsWidth = controlsElement.getBoundingClientRect().width;
			const availableInlineWidth =
				headerElement.getBoundingClientRect().width - controlsWidth - 12;
			const estimatedLineCount =
				availableInlineWidth > 0
					? Math.ceil((textWidth + iconAndGapWidth) / availableInlineWidth)
					: Number.POSITIVE_INFINITY;

			setStackControls(estimatedLineCount > 2);
		};

		updateStackedLayout();

		const resizeObserver = new ResizeObserver(() => {
			updateStackedLayout();
		});
		resizeObserver.observe(headerElement);
		resizeObserver.observe(controlsElement);
		resizeObserver.observe(titleElement);

		return () => {
			resizeObserver.disconnect();
		};
	}, [enableSorting, label]);

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
			<div
				ref={headerRef}
				className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
			>
				<div className="group relative flex min-h-12 min-w-0 flex-1 items-center gap-2">
					<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
						<Icon className="w-3 h-3 text-white" />
					</div>
					<span
						ref={titleRef}
						className="min-w-0 block text-sm font-bold uppercase tracking-wide text-primary"
					>
						{label}
					</span>
				</div>

				{enableSorting && (
					<div
						ref={controlsRef}
						className={`flex shrink-0 items-center rounded-lg border border-border/60 bg-background/40 p-0.5 ${
							stackControls ? "ml-auto basis-full justify-end" : "ml-auto"
						}`}
					>
						{availableSortOptions.map(({ metric, icon: MetricIcon, label }) => (
							<Tooltip key={metric} delayDuration={0}>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={(event) => handleSortClick(event, metric)}
										className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
											effectiveSortMetric === metric
												? "bg-primary text-white"
												: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
				inputClassName="bg-background/40 border-border/60 hover:border-primary/30 focus:border-primary/50 placeholder:text-muted-foreground"
			/>
		</div>
	);
}
