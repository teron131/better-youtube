import { ExampleUrls } from "@ui/components/ExampleUrls";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import {
	type ComboboxOption,
	EditableCombobox,
	findMatchingComboboxOption,
} from "@ui/components/ui/editable-combobox";
import { Input } from "@ui/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { useModelSelection, useUserPreferences } from "@ui/hooks/use-config";
import { AlertCircle, ArrowUp, Captions, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	isFormValid,
	prepareProcessingOptions,
	validateYouTubeUrl,
} from "@/core/utils/validation";
import { toModelComboboxOption } from "../lib/model-options";

interface VideoUrlFormProps {
	onSubmit: (
		url: string,
		options?: {
			targetLanguage?: string;
			summaryModel?: string;
			qualityModel?: string;
		},
		action?: "caption" | "summary",
	) => void;
	isLoading: boolean;
	initialUrl?: string;
}

const SUMMARY_MODEL_INPUT_CLASS_NAME =
	"h-8 rounded-full border border-transparent bg-transparent text-xs shadow-none hover:bg-transparent hover:border-primary/20 focus:border-border/60 focus:hover:border-border/60 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0";

function measureModelWidthLabel(label: string): string {
	const withoutProvider = label.includes(":")
		? label.split(":").slice(1).join(":").trim()
		: label;

	return withoutProvider.replace(/\s*\(\$[^)]+\)\s*$/, "").trim();
}

function summaryModelWidth(
	options: ComboboxOption[],
	currentValue: string,
): string {
	const widestLabelLength = Math.max(
		...options.map((option) => measureModelWidthLabel(option.label).length),
		measureModelWidthLabel(currentValue).length,
		"Model".length,
	);

	return `${widestLabelLength + 4}ch`;
}

export const VideoUrlForm = ({
	onSubmit,
	isLoading,
	initialUrl,
}: VideoUrlFormProps) => {
	const [url, setUrl] = useState(initialUrl || "");
	const [validationError, setValidationError] = useState<string>("");
	const [showExamples, setShowExamples] = useState(false);
	const { preferences, updatePreferences } = useUserPreferences();
	const { summarizerModels } = useModelSelection();

	const modelOptions = useMemo<ComboboxOption[]>(
		() =>
			summarizerModels.map((model) =>
				toModelComboboxOption(model, { iconClassName: "h-4 w-4 opacity-80" }),
			),
		[summarizerModels],
	);
	const selectedModelOption = useMemo(
		() => findMatchingComboboxOption(modelOptions, preferences.summaryModel),
		[modelOptions, preferences.summaryModel],
	);
	const modelTriggerWidth = useMemo(
		() => summaryModelWidth(modelOptions, preferences.summaryModel),
		[modelOptions, preferences.summaryModel],
	);

	useEffect(() => {
		if (initialUrl) setUrl(initialUrl);
	}, [initialUrl]);

	const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newUrl = e.target.value;
		setUrl(newUrl);
		if (validationError) setValidationError("");
		setShowExamples(newUrl.trim().length === 0);
	};

	const handleSubmit = async (
		e: React.SyntheticEvent,
		action: "caption" | "summary" = "summary",
	) => {
		e.preventDefault();
		const trimmedUrl = url.trim();

		const options = prepareProcessingOptions(
			preferences.targetLanguage,
			preferences.summaryModel,
			preferences.qualityModel,
		);

		if (!trimmedUrl) {
			setValidationError("");
			onSubmit("", options, action);
			return;
		}

		const validation = validateYouTubeUrl(trimmedUrl);
		if (!validation.isValid) {
			setValidationError(validation.error || "Invalid URL");
			return;
		}

		setValidationError("");
		onSubmit(trimmedUrl, options, action);
	};

	const handleExampleClick = (exampleUrl: string) => {
		setUrl(exampleUrl);
		setShowExamples(false);
		setValidationError("");
	};

	const renderSelectedModelIcon = () => selectedModelOption?.icon ?? null;

	return (
		<Card className="w-full rounded-[24px] p-0 border border-border/60 bg-muted/40 hover:border-primary/15 transition-all duration-500">
			<form
				onSubmit={(event) => handleSubmit(event, "summary")}
				className="space-y-3 p-4 sm:p-5"
			>
				<div className="space-y-2">
					<div
						className={`rounded-2xl bg-transparent px-4 py-2 shadow-none transition-all duration-300 ${
							validationError ? "ring-1 ring-destructive/60" : ""
						}`}
					>
						<Input
							type="url"
							placeholder="https://youtube.com/watch?v=..."
							value={url}
							onChange={handleUrlChange}
							className="h-8 border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0"
							disabled={isLoading}
						/>
					</div>

					{validationError && (
						<Alert
							variant="destructive"
							className="border-destructive/50 bg-destructive/10"
						>
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{validationError}</AlertDescription>
						</Alert>
					)}

					{showExamples && <ExampleUrls onSelect={handleExampleClick} />}
				</div>

				<div className="flex items-center justify-between gap-3 pt-1">
					<div className="flex flex-1 min-w-0 items-center gap-2">
						<div
							className="max-w-full"
							style={{ width: `min(100%, ${modelTriggerWidth})` }}
						>
							<EditableCombobox
								value={preferences.summaryModel}
								onChange={(value) => updatePreferences({ summaryModel: value })}
								options={modelOptions}
								placeholder="Model"
								className="w-full"
								inputClassName={SUMMARY_MODEL_INPUT_CLASS_NAME}
								contentClassName="rounded-xl"
								renderIcon={renderSelectedModelIcon}
								renderOption={(option) => (
									<>
										{option.icon && (
											<span className="mr-2 flex h-4 w-4 items-center justify-center">
												{option.icon}
											</span>
										)}
										<span className="truncate">{option.label}</span>
									</>
								)}
							/>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									disabled={isLoading || !isFormValid(url)}
									onClick={(event) => handleSubmit(event, "caption")}
									className="h-9 w-9 rounded-full border border-transparent bg-transparent text-foreground hover:bg-transparent hover:border-primary/25 transition-all active:border-transparent"
									aria-label="Generate captions"
								>
									<Captions className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Caption</p>
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="submit"
									size="icon"
									disabled={isLoading || !isFormValid(url)}
									className="h-9 w-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-60"
									aria-label="Generate summary"
								>
									{isLoading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<ArrowUp className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Summary</p>
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</form>
		</Card>
	);
};
