import { ModelSelector } from "@ui/components/ModelSelector";
import { RecommendationFilterSettings } from "@ui/components/RecommendationFilterSettings";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/ui/select";
import { Switch } from "@ui/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { useModelSelection } from "@ui/hooks/use-config";
import { useToast } from "@ui/hooks/use-toast";
import {
	ArrowLeft,
	Bot,
	Cpu,
	Globe,
	Key,
	Settings as SettingsIcon,
	Sparkles,
	Type,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadConfig, normalizeModelCostLimit } from "@/core/config";
import type { FontSize } from "@/core/constants";
import {
	DEFAULTS,
	MESSAGE_ACTIONS,
	STORAGE_KEYS,
	TARGET_LANGUAGES,
} from "@/core/constants";
import { getStorageValue, setStorageValue } from "@/core/storage";
import { applySummaryFontSize } from "../lib/font-size";
import { toModelComboboxOption } from "../lib/model-options";
import { SIDEPANEL_ROUTE_HREFS } from "../lib/routes";

type ModelCostLimitKey = "summarizerModelCostLimit" | "refinerModelCostLimit";

const DEFAULT_SETTINGS = {
	llmApiKey: "",
	llmBaseUrl: "",
	geminiApiKey: "",
	summarizerProvider: "auto",
	summarizerMode: "validation",
	summarizerModel: "google/gemini-3-flash-preview",
	refinerModel: "google/gemini-2.5-flash-lite-preview-09-2025",
	summarizerModelCostLimit: Number(DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT),
	refinerModelCostLimit: Number(DEFAULTS.REFINER_MODEL_COST_LIMIT),
	targetLanguage: "auto",
	captionFontSize: "M",
	summaryFontSize: "M",
	autoGenerate: false,
};

type SettingsState = typeof DEFAULT_SETTINGS;
type ModelCostLimitInputs = Record<ModelCostLimitKey, string>;

type ApiField = {
	key:
		| typeof STORAGE_KEYS.LLM_API_KEY
		| typeof STORAGE_KEYS.LLM_BASE_URL
		| typeof STORAGE_KEYS.GEMINI_API_KEY;
	label: string;
	href?: string;
	placeholder: string;
	type?: "password" | "url";
};

const FONT_SIZE_OPTIONS: FontSize[] = ["S", "M", "L"];
const SETTINGS_SECTION_CLASSNAME = "space-y-4 border-t border-border/70 pt-5";
const API_KEY_FIELDS: ApiField[] = [
	{
		key: STORAGE_KEYS.LLM_API_KEY,
		label: "LLM API Key",
		placeholder: "sk-...",
		type: "password",
	},
	{
		key: STORAGE_KEYS.LLM_BASE_URL,
		label: "LLM Base URL",
		placeholder:
			"Any OpenAI API compatible base URL, e.g. https://api.openai.com/v1",
		type: "url",
	},
	{
		key: STORAGE_KEYS.GEMINI_API_KEY,
		label: "Gemini API Key",
		href: "https://aistudio.google.com/api-keys",
		placeholder: "...",
		type: "password",
	},
] as const;

const SETTINGS_STORAGE_KEYS: Record<keyof typeof DEFAULT_SETTINGS, string> = {
	llmApiKey: STORAGE_KEYS.LLM_API_KEY,
	llmBaseUrl: STORAGE_KEYS.LLM_BASE_URL,
	geminiApiKey: STORAGE_KEYS.GEMINI_API_KEY,
	summarizerProvider: STORAGE_KEYS.SUMMARIZER_PROVIDER,
	summarizerMode: STORAGE_KEYS.SUMMARIZER_MODE,
	summarizerModel: STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
	refinerModel: STORAGE_KEYS.REFINER_CUSTOM_MODEL,
	summarizerModelCostLimit: STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT,
	refinerModelCostLimit: STORAGE_KEYS.REFINER_MODEL_COST_LIMIT,
	targetLanguage: STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
	captionFontSize: STORAGE_KEYS.CAPTION_FONT_SIZE,
	summaryFontSize: STORAGE_KEYS.SUMMARY_FONT_SIZE,
	autoGenerate: STORAGE_KEYS.AUTO_GENERATE,
};

const DEFAULT_MODEL_COST_LIMIT_INPUTS: ModelCostLimitInputs = {
	summarizerModelCostLimit: String(DEFAULT_SETTINGS.summarizerModelCostLimit),
	refinerModelCostLimit: String(DEFAULT_SETTINGS.refinerModelCostLimit),
};

function clampModelCostLimit(
	value: number,
	priceRange: { min: number | null; max: number | null },
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

function resolveVisibleModelKey(
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

function modelCostLimitBounds(priceRange: {
	min: number | null;
	max: number | null;
}): {
	min: string;
	max?: string;
} {
	return {
		min: priceRange.min != null ? priceRange.min.toFixed(1) : "0.1",
		max: priceRange.max != null ? priceRange.max.toFixed(1) : undefined,
	};
}

const Settings = () => {
	const { toast } = useToast();
	const {
		allSummarizerModels,
		allRefinerModels,
		summarizerModelPriceRange,
		refinerModelPriceRange,
	} = useModelSelection();
	const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
	const [modelCostLimitInputs, setModelCostLimitInputs] =
		useState<ModelCostLimitInputs>(DEFAULT_MODEL_COST_LIMIT_INPUTS);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadedStoredSettings, setHasLoadedStoredSettings] = useState(false);
	const summarizerCostLimitBounds = modelCostLimitBounds(
		summarizerModelPriceRange,
	);
	const refinerCostLimitBounds = modelCostLimitBounds(refinerModelPriceRange);
	const visibleSummarizerModels = useMemo(
		() =>
			allSummarizerModels.filter(
				(model) =>
					typeof model.price !== "number" ||
					model.price <= settings.summarizerModelCostLimit,
			),
		[allSummarizerModels, settings.summarizerModelCostLimit],
	);
	const visibleRefinerModels = useMemo(
		() =>
			allRefinerModels.filter(
				(model) =>
					typeof model.price !== "number" ||
					model.price <= settings.refinerModelCostLimit,
			),
		[allRefinerModels, settings.refinerModelCostLimit],
	);
	const selectorConfigs = useMemo(
		() => [
			{
				modelKey: "summarizerModel" as const,
				costLimitKey: "summarizerModelCostLimit" as const,
				label: "Summary Model",
				icon: Bot,
				options: visibleSummarizerModels,
				priceRange: summarizerModelPriceRange,
				costLimitBounds: summarizerCostLimitBounds,
				defaultSortMetric: "intelligence" as const,
				costLimitAriaLabel: "Summary model cost limit",
			},
			{
				modelKey: "refinerModel" as const,
				costLimitKey: "refinerModelCostLimit" as const,
				label: "Caption Refinement Model",
				icon: Sparkles,
				options: visibleRefinerModels,
				priceRange: refinerModelPriceRange,
				costLimitBounds: refinerCostLimitBounds,
				defaultSortMetric: "speed" as const,
				costLimitAriaLabel: "Caption refinement model cost limit",
			},
		],
		[
			refinerCostLimitBounds,
			refinerModelPriceRange,
			summarizerCostLimitBounds,
			summarizerModelPriceRange,
			visibleRefinerModels,
			visibleSummarizerModels,
		],
	);

	useEffect(() => {
		const loadSettings = async () => {
			try {
				const config = await loadConfig();
				const nextSettings: typeof DEFAULT_SETTINGS = {
					llmApiKey: config.llmApiKey ?? "",
					llmBaseUrl: config.llmBaseUrl ?? "",
					geminiApiKey: config.geminiApiKey ?? "",
					summarizerProvider: config.summarizerProvider,
					summarizerMode: config.summarizerMode,
					summarizerModel: config.summarizerModel,
					refinerModel: config.refinerModel,
					summarizerModelCostLimit: config.summarizerModelCostLimit,
					refinerModelCostLimit: config.refinerModelCostLimit,
					targetLanguage: config.targetLanguage,
					captionFontSize: config.captionFontSize,
					summaryFontSize: config.summaryFontSize,
					autoGenerate: config.autoGenerate,
				};
				setSettings(nextSettings);
				setModelCostLimitInputs({
					summarizerModelCostLimit: String(
						nextSettings.summarizerModelCostLimit,
					),
					refinerModelCostLimit: String(nextSettings.refinerModelCostLimit),
				});
				applySummaryFontSize(nextSettings.summaryFontSize as FontSize);
				setHasLoadedStoredSettings(true);
			} catch (error) {
				console.error("Failed to load settings:", error);
				toast({
					title: "Error",
					description: "Failed to load settings.",
					variant: "destructive",
				});
			} finally {
				setIsLoading(false);
			}
		};
		loadSettings();
	}, [toast]);

	const notifyCaptionFontSizeChange = (fontSize: FontSize) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			tabs.forEach((tab) => {
				if (!tab.id) return;
				chrome.tabs.sendMessage(tab.id, {
					action: MESSAGE_ACTIONS.UPDATE_CAPTION_FONT_SIZE,
					fontSize,
				});
			});
		});
	};

	const commitModelCostLimit = async (
		key: ModelCostLimitKey,
		rawValue: string,
		priceRange: { min: number | null; max: number | null },
	) => {
		const nextValue = clampModelCostLimit(
			normalizeModelCostLimit(rawValue),
			priceRange,
		);
		await handleChange(key, nextValue);
	};

	const setModelCostLimitInput = (key: ModelCostLimitKey, value: string) => {
		setModelCostLimitInputs((currentInputs) =>
			currentInputs[key] === value
				? currentInputs
				: { ...currentInputs, [key]: value },
		);
	};

	const handleModelCostLimitInputChange = (
		key: ModelCostLimitKey,
		rawValue: string,
		priceRange: { min: number | null; max: number | null },
	) => {
		if (rawValue.trim() === "") {
			setModelCostLimitInput(key, rawValue);
			return;
		}

		const parsedValue = Number.parseFloat(rawValue);
		if (!Number.isFinite(parsedValue)) {
			setModelCostLimitInput(key, rawValue);
			return;
		}

		const nextValue = clampModelCostLimit(parsedValue, priceRange);
		const normalizedValue = Number.parseFloat(nextValue.toFixed(1));
		setModelCostLimitInput(key, String(normalizedValue));
		setSettings((currentSettings) =>
			currentSettings[key] === normalizedValue
				? currentSettings
				: { ...currentSettings, [key]: normalizedValue },
		);
	};

	const renderModelCostLimitControl = (
		key: ModelCostLimitKey,
		priceRange: { min: number | null; max: number | null },
		costLimitBounds: {
			min: string;
			max?: string;
		},
		ariaLabel: string,
	) => (
		<>
			<span className="text-[10px] font-semibold text-muted-foreground">≤</span>
			<Tooltip delayDuration={0}>
				<TooltipTrigger asChild>
					<Input
						type="number"
						min={costLimitBounds.min}
						max={costLimitBounds.max}
						step="0.1"
						value={modelCostLimitInputs[key]}
						onChange={(event) =>
							handleModelCostLimitInputChange(
								key,
								event.target.value,
								priceRange,
							)
						}
						onBlur={() => {
							void commitModelCostLimit(
								key,
								modelCostLimitInputs[key],
								priceRange,
							);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.currentTarget.blur();
						}}
						className="h-6 w-14 rounded-sm border-0 bg-transparent px-1 text-right text-xs shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
						aria-label={ariaLabel}
					/>
				</TooltipTrigger>
				<TooltipContent>
					<p>Max blended price</p>
				</TooltipContent>
			</Tooltip>
		</>
	);

	useEffect(() => {
		if (
			summarizerModelPriceRange.min == null ||
			summarizerModelPriceRange.max == null ||
			refinerModelPriceRange.min == null ||
			refinerModelPriceRange.max == null
		) {
			return;
		}

		setSettings((currentSettings) => {
			const clampedSummarizerValue = clampModelCostLimit(
				currentSettings.summarizerModelCostLimit,
				summarizerModelPriceRange,
			);
			const clampedRefinerValue = clampModelCostLimit(
				currentSettings.refinerModelCostLimit,
				refinerModelPriceRange,
			);
			if (
				clampedSummarizerValue === currentSettings.summarizerModelCostLimit &&
				clampedRefinerValue === currentSettings.refinerModelCostLimit
			) {
				return currentSettings;
			}
			return {
				...currentSettings,
				summarizerModelCostLimit: clampedSummarizerValue,
				refinerModelCostLimit: clampedRefinerValue,
			};
		});

		setModelCostLimitInputs((currentInputs) => ({
			summarizerModelCostLimit: String(
				clampModelCostLimit(
					normalizeModelCostLimit(currentInputs.summarizerModelCostLimit),
					summarizerModelPriceRange,
				),
			),
			refinerModelCostLimit: String(
				clampModelCostLimit(
					normalizeModelCostLimit(currentInputs.refinerModelCostLimit),
					refinerModelPriceRange,
				),
			),
		}));
	}, [refinerModelPriceRange, summarizerModelPriceRange]);

	useEffect(() => {
		if (!hasLoadedStoredSettings) {
			return;
		}
		if (
			selectorConfigs.some(
				(selectorConfig) => selectorConfig.options.length === 0,
			)
		) {
			return;
		}

		const nextModelSettings = selectorConfigs.reduce<Partial<SettingsState>>(
			(updates, selectorConfig) => {
				const nextModel = resolveVisibleModelKey(
					settings[selectorConfig.modelKey],
					selectorConfig.options,
					DEFAULT_SETTINGS[selectorConfig.modelKey],
				);
				if (nextModel !== settings[selectorConfig.modelKey]) {
					updates[selectorConfig.modelKey] = nextModel;
				}
				return updates;
			},
			{},
		);

		if (Object.keys(nextModelSettings).length === 0) {
			return;
		}

		setSettings((currentSettings) => ({
			...currentSettings,
			...nextModelSettings,
		}));

		void Promise.all([
			...selectorConfigs.flatMap((selectorConfig) => {
				const nextModel = nextModelSettings[selectorConfig.modelKey];
				return nextModel
					? [
							setStorageValue(
								SETTINGS_STORAGE_KEYS[selectorConfig.modelKey],
								nextModel,
							),
						]
					: [];
			}),
		]).catch((error) => {
			console.error(
				"Failed to sync model selections after cost-limit change:",
				error,
			);
			toast({
				title: "Couldn't update model selection",
				description:
					"A hidden model stayed selected after the cost limit changed.",
				variant: "destructive",
			});
		});
	}, [hasLoadedStoredSettings, selectorConfigs, settings, toast]);

	const handleChange = async <K extends keyof typeof DEFAULT_SETTINGS>(
		key: K,
		value: (typeof DEFAULT_SETTINGS)[K],
	) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
		try {
			await setStorageValue(SETTINGS_STORAGE_KEYS[key], value);
			if (
				key === "summarizerModelCostLimit" ||
				key === "refinerModelCostLimit"
			) {
				const storedValue = await getStorageValue<number>(
					SETTINGS_STORAGE_KEYS[key],
				);
				const priceRange =
					key === "summarizerModelCostLimit"
						? summarizerModelPriceRange
						: refinerModelPriceRange;
				const resolvedValue = clampModelCostLimit(
					normalizeModelCostLimit(storedValue ?? value),
					priceRange,
				);
				setSettings((currentSettings) => ({
					...currentSettings,
					[key]: resolvedValue,
				}));
				setModelCostLimitInput(key, String(resolvedValue));
			}
			console.log(`Auto-saved ${key}:`, value);
			if (key === "summaryFontSize") {
				applySummaryFontSize(value as FontSize);
			} else if (key === "captionFontSize") {
				notifyCaptionFontSizeChange(value as FontSize);
			}
		} catch (error) {
			console.error(`Failed to auto-save setting ${key}:`, error);
			toast({
				title: "Couldn't save setting",
				description:
					error instanceof Error ? error.message : "The setting was not saved.",
				variant: "destructive",
			});
		}
	};

	const renderFontSizeSelector = (
		key: "captionFontSize" | "summaryFontSize",
	) => (
		<div className="grid grid-cols-3 rounded-md border border-border/70 bg-background p-1">
			{FONT_SIZE_OPTIONS.map((size) => (
				<button
					key={size}
					type="button"
					onClick={() => handleChange(key, size)}
					className={`h-9 rounded-sm text-sm font-semibold transition-colors ${
						settings[key] === size
							? "bg-primary text-white"
							: "text-muted-foreground hover:bg-muted hover:text-foreground"
					}`}
				>
					{size}
				</button>
			))}
		</div>
	);

	if (isLoading) {
		return (
			<div className="app-shell flex items-center justify-center">
				<div className="animate-pulse flex flex-col items-center gap-4">
					<div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
						<SettingsIcon className="h-6 w-6 text-primary animate-spin-slow" />
					</div>
					<p className="text-muted-foreground font-medium">
						Loading settings...
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="app-shell pb-10">
			<div className="absolute top-[var(--sidepanel-topbar-offset)] left-0 right-0 z-50">
				<div className="sidepanel-container">
					<div className="flex min-h-[var(--sidepanel-topbar-height)] items-center justify-between w-full">
						<div className="fade-in-up">
							<h1 className="text-4xl font-black tracking-tight text-foreground">
								Settings
							</h1>
						</div>
						<Button
							asChild
							variant="ghost"
							size="icon"
							className="text-muted-foreground hover:text-foreground transition-all"
						>
							<a
								aria-label="Back to main page"
								href={SIDEPANEL_ROUTE_HREFS.home}
							>
								<ArrowLeft className="h-6 w-6" />
							</a>
						</Button>
					</div>
				</div>
			</div>

			<div className="sidepanel-container pt-24">
				<div className="grid grid-cols-1 gap-8 fade-in-up stagger-1">
					{/* API Configuration */}
					<section className={SETTINGS_SECTION_CLASSNAME}>
						<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
							<Key className="h-4 w-4 text-primary" />
							<span>API Configuration</span>
						</div>
						<div className="space-y-4">
							{API_KEY_FIELDS.map((field) => (
								<div className="space-y-1.5" key={field.key}>
									<div className="flex items-center justify-between gap-3">
										<Label
											htmlFor={field.key}
											className="text-sm font-semibold"
										>
											{field.label}
										</Label>
										{"href" in field && field.href && (
											<a
												href={field.href}
												target="_blank"
												rel="noreferrer"
												className="text-xs text-primary/80 hover:text-primary hover:underline"
											>
												Get key ↗
											</a>
										)}
									</div>
									<Input
										id={field.key}
										type={field.type ?? "password"}
										value={settings[field.key]}
										onChange={(e) => handleChange(field.key, e.target.value)}
										className="h-10 rounded-md border-border/70 bg-background"
										placeholder={field.placeholder}
									/>
								</div>
							))}
						</div>
					</section>

					{/* Model Configuration */}
					<section className={SETTINGS_SECTION_CLASSNAME}>
						<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
							<Cpu className="h-4 w-4 text-primary" />
							<span>Model Configuration</span>
						</div>
						<div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
							{selectorConfigs.map((selectorConfig) => (
								<ModelSelector
									key={selectorConfig.modelKey}
									label={selectorConfig.label}
									icon={selectorConfig.icon}
									value={settings[selectorConfig.modelKey]}
									onChange={(value) =>
										handleChange(selectorConfig.modelKey, value)
									}
									options={selectorConfig.options.map((model) =>
										toModelComboboxOption(model),
									)}
									placeholder="Select or type model..."
									enableSorting
									defaultSortMetric={selectorConfig.defaultSortMetric}
									sortControlsTrailing={renderModelCostLimitControl(
										selectorConfig.costLimitKey,
										selectorConfig.priceRange,
										selectorConfig.costLimitBounds,
										selectorConfig.costLimitAriaLabel,
									)}
								/>
							))}
						</div>
					</section>

					{/* Generation */}
					<section className={SETTINGS_SECTION_CLASSNAME}>
						<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
							<Zap className="h-4 w-4 text-primary" />
							<span>Generation</span>
						</div>
						<div className="space-y-5">
							<div className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-semibold">
									<Globe className="h-4 w-4 text-primary" />
									<span>Target Language</span>
								</div>
								<Select
									value={settings.targetLanguage}
									onValueChange={(val) => handleChange("targetLanguage", val)}
								>
									<SelectTrigger className="h-10 rounded-md border-border/70 bg-background">
										<SelectValue placeholder="Language" />
									</SelectTrigger>
									<SelectContent className="rounded-md">
										{TARGET_LANGUAGES.map((lang) => (
											<SelectItem key={lang.value} value={lang.value}>
												{lang.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold">
										<Cpu className="h-4 w-4 text-primary" />
										<span>Provider</span>
									</div>
									<Select
										value={settings.summarizerProvider}
										onValueChange={(val) =>
											handleChange("summarizerProvider", val)
										}
									>
										<SelectTrigger className="h-10 rounded-md border-border/70 bg-background">
											<SelectValue placeholder="Auto" />
										</SelectTrigger>
										<SelectContent className="rounded-md">
											<SelectItem value="auto">Auto</SelectItem>
											<SelectItem value="gemini">Gemini Native</SelectItem>
											<SelectItem value="llm">LLM</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-semibold">
										<Sparkles className="h-4 w-4 text-primary" />
										<span>Mode</span>
									</div>
									<Select
										value={settings.summarizerMode}
										onValueChange={async (val) => {
											await handleChange("summarizerMode", val);
										}}
									>
										<SelectTrigger className="h-10 rounded-md border-border/70 bg-background">
											<SelectValue placeholder="Select mode" />
										</SelectTrigger>
										<SelectContent className="rounded-md">
											<SelectItem value="native">Gemini Native</SelectItem>
											<SelectItem value="validation">
												Validation Agent
											</SelectItem>
											<SelectItem value="fast">Fast Agent</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="flex items-center justify-between gap-4 pt-1">
								<div className="flex items-center gap-2 text-sm font-semibold">
									<Sparkles className="h-4 w-4 text-primary" />
									<span>Auto-Generate Caption</span>
								</div>
								<Switch
									checked={settings.autoGenerate}
									onCheckedChange={(checked) =>
										handleChange("autoGenerate", checked)
									}
									className="scale-75 data-[state=checked]:bg-primary"
								/>
							</div>
						</div>
					</section>

					{/* Appearance */}
					<RecommendationFilterSettings />

					<section className={SETTINGS_SECTION_CLASSNAME}>
						<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
							<Type className="h-4 w-4 text-primary" />
							<span>Font Size</span>
						</div>
						<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
							<div className="space-y-2">
								<Label className="text-sm font-semibold text-foreground">
									Caption Overlay
								</Label>
								{renderFontSizeSelector("captionFontSize")}
							</div>
							<div className="space-y-2">
								<Label className="text-sm font-semibold text-foreground">
									Summary Panel
								</Label>
								{renderFontSizeSelector("summaryFontSize")}
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
};

export default Settings;
