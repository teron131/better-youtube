import { ModelSelector } from "@ui/components/ModelSelector";
import { RecommendationFilterSettings } from "@ui/components/RecommendationFilterSettings";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@ui/components/ui/card";
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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const DEFAULT_SETTINGS = {
	llmApiKey: "",
	llmBaseUrl: "",
	geminiApiKey: "",
	summarizerProvider: "auto",
	summarizerMode: "validation",
	summarizerModel: "google/gemini-3-flash-preview",
	refinerModel: "google/gemini-2.5-flash-lite-preview-09-2025",
	modelCostLimit: Number(DEFAULTS.MODEL_COST_LIMIT),
	targetLanguage: "auto",
	captionFontSize: "M",
	summaryFontSize: "M",
	autoGenerate: false,
};

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

const SELECT_TRIGGER_CLASSNAME = "w-[200px] h-9 rounded-xl text-xs";
const FONT_SIZE_OPTIONS: FontSize[] = ["S", "M", "L"];
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
	modelCostLimit: STORAGE_KEYS.MODEL_COST_LIMIT,
	targetLanguage: STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
	captionFontSize: STORAGE_KEYS.CAPTION_FONT_SIZE,
	summaryFontSize: STORAGE_KEYS.SUMMARY_FONT_SIZE,
	autoGenerate: STORAGE_KEYS.AUTO_GENERATE,
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
	const navigate = useNavigate();
	const { toast } = useToast();
	const {
		summarizerModels,
		refinerModels,
		allSummarizerModels,
		allRefinerModels,
		modelPriceRange,
	} = useModelSelection();
	const [settings, setSettings] = useState(DEFAULT_SETTINGS);
	const [modelCostLimitInput, setModelCostLimitInput] = useState(
		String(DEFAULT_SETTINGS.modelCostLimit),
	);
	const [isLoading, setIsLoading] = useState(true);
	const costLimitBounds = modelCostLimitBounds(modelPriceRange);
	const visibleSummarizerModels = allSummarizerModels.filter(
		(model) =>
			typeof model.price !== "number" || model.price <= settings.modelCostLimit,
	);
	const visibleRefinerModels = allRefinerModels.filter(
		(model) =>
			typeof model.price !== "number" || model.price <= settings.modelCostLimit,
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
					modelCostLimit: config.modelCostLimit,
					targetLanguage: config.targetLanguage,
					captionFontSize: config.captionFontSize,
					summaryFontSize: config.summaryFontSize,
					autoGenerate: config.autoGenerate,
				};
				setSettings(nextSettings);
				setModelCostLimitInput(String(nextSettings.modelCostLimit));
				applySummaryFontSize(nextSettings.summaryFontSize as FontSize);
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

	const commitModelCostLimit = async () => {
		const nextValue = clampModelCostLimit(
			normalizeModelCostLimit(modelCostLimitInput),
			modelPriceRange,
		);
		await handleChange("modelCostLimit", nextValue);
	};

	const handleModelCostLimitInputChange = (rawValue: string) => {
		if (rawValue.trim() === "") {
			setModelCostLimitInput(rawValue);
			return;
		}

		const parsedValue = Number.parseFloat(rawValue);
		if (!Number.isFinite(parsedValue)) {
			setModelCostLimitInput(rawValue);
			return;
		}

		const nextValue = clampModelCostLimit(parsedValue, modelPriceRange);
		const normalizedValue = Number.parseFloat(nextValue.toFixed(1));
		const nextText = String(normalizedValue);

		setModelCostLimitInput(nextText);
		setSettings((currentSettings) =>
			currentSettings.modelCostLimit === normalizedValue
				? currentSettings
				: { ...currentSettings, modelCostLimit: normalizedValue },
		);
	};

	const renderModelCostLimitControl = (ariaLabel: string) => (
		<>
			<span className="text-[10px] font-semibold text-muted-foreground">≤</span>
			<Tooltip delayDuration={0}>
				<TooltipTrigger asChild>
					<Input
						type="number"
						min={costLimitBounds.min}
						max={costLimitBounds.max}
						step="0.1"
						value={modelCostLimitInput}
						onChange={(event) =>
							handleModelCostLimitInputChange(event.target.value)
						}
						onBlur={() => {
							void commitModelCostLimit();
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.currentTarget.blur();
						}}
						className="h-6 w-16 rounded-sm border-0 bg-transparent px-1 text-right text-xs shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
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
		if (modelPriceRange.min == null || modelPriceRange.max == null) {
			return;
		}

		setSettings((currentSettings) => {
			const clampedValue = clampModelCostLimit(
				currentSettings.modelCostLimit,
				modelPriceRange,
			);
			if (clampedValue === currentSettings.modelCostLimit) {
				return currentSettings;
			}
			return { ...currentSettings, modelCostLimit: clampedValue };
		});

		setModelCostLimitInput((currentInput) => {
			const clampedValue = clampModelCostLimit(
				normalizeModelCostLimit(currentInput),
				modelPriceRange,
			);
			return String(clampedValue);
		});
	}, [modelPriceRange]);

	const handleChange = async <K extends keyof typeof DEFAULT_SETTINGS>(
		key: K,
		value: (typeof DEFAULT_SETTINGS)[K],
	) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
		try {
			await setStorageValue(SETTINGS_STORAGE_KEYS[key], value);
			if (key === "modelCostLimit") {
				const storedValue = await getStorageValue<number>(
					STORAGE_KEYS.MODEL_COST_LIMIT,
				);
				const resolvedValue = clampModelCostLimit(
					normalizeModelCostLimit(storedValue ?? value),
					modelPriceRange,
				);
				setSettings((currentSettings) => ({
					...currentSettings,
					modelCostLimit: resolvedValue,
				}));
				setModelCostLimitInput(String(resolvedValue));
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
		<div className="flex bg-muted/30 rounded-xl p-1 border border-border/60">
			{FONT_SIZE_OPTIONS.map((size) => (
				<button
					key={size}
					type="button"
					onClick={() => handleChange(key, size)}
					className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
						settings[key] === size
							? "bg-primary text-white shadow-lg"
							: "text-muted-foreground hover:text-foreground"
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
							variant="ghost"
							size="icon"
							onClick={() => navigate("/")}
							className="text-muted-foreground hover:text-foreground transition-all"
						>
							<ArrowLeft className="h-6 w-6" />
						</Button>
					</div>
				</div>
			</div>

			<div className="sidepanel-container pt-24">
				<div className="grid grid-cols-1 gap-2 fade-in-up stagger-1">
					{/* API Configuration */}
					<Card className="rounded-xl hover:border-primary/10 transition-all duration-500">
						<CardHeader className="p-4 pb-1">
							<div className="flex items-center gap-2 text-primary mb-0.5">
								<Key className="h-4 w-4" />
								<span className="text-xs font-bold uppercase tracking-widest">
									API Configuration
								</span>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-1 space-y-2.5">
							{API_KEY_FIELDS.map((field) => (
								<div className="space-y-1" key={field.key}>
									<div className="flex items-center justify-between">
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
												className="text-[10px] text-primary/80 hover:text-primary hover:underline"
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
										className="h-10 rounded-xl"
										placeholder={field.placeholder}
									/>
								</div>
							))}
						</CardContent>
					</Card>

					{/* Model Configuration */}
					<Card className="rounded-xl hover:border-primary/10 transition-all duration-500">
						<CardHeader className="p-4 pb-1">
							<div className="flex items-center gap-2 text-primary mb-0.5">
								<Cpu className="h-4 w-4" />
								<span className="text-xs font-bold uppercase tracking-widest">
									Model Configuration
								</span>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-4">
							<ModelSelector
								label="Summary Model"
								icon={Bot}
								value={settings.summarizerModel}
								onChange={(val) => handleChange("summarizerModel", val)}
								options={visibleSummarizerModels.map((model) =>
									toModelComboboxOption(model),
								)}
								placeholder="Select or type model..."
								enableSorting
								defaultSortMetric="intelligence"
								sortControlsTrailing={renderModelCostLimitControl(
									"Summary model cost limit",
								)}
							/>
							<ModelSelector
								label="Caption Refinement Model"
								icon={Sparkles}
								value={settings.refinerModel}
								onChange={(val) => handleChange("refinerModel", val)}
								options={visibleRefinerModels.map((model) =>
									toModelComboboxOption(model),
								)}
								placeholder="Select or type model..."
								enableSorting
								defaultSortMetric="speed"
								sortControlsTrailing={renderModelCostLimitControl(
									"Caption refinement model cost limit",
								)}
							/>
						</CardContent>
					</Card>

					{/* Generation */}
					<Card className="rounded-xl hover:border-primary/10 transition-all duration-500">
						<CardHeader className="p-4 pb-1">
							<div className="flex items-center gap-2 text-primary mb-0.5">
								<Zap className="h-4 w-4" />
								<span className="text-xs font-bold uppercase tracking-widest">
									Generation
								</span>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-1 space-y-2">
							{/* Language */}
							<div className="flex flex-row items-center justify-between gap-4 p-2 rounded-2xl bg-muted/30 border border-border/60">
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
										<Globe className="h-4 w-4" />
									</div>
									<div>
										<h4 className="font-bold text-foreground text-sm">
											Target Language
										</h4>
									</div>
								</div>
								<Select
									value={settings.targetLanguage}
									onValueChange={(val) => handleChange("targetLanguage", val)}
								>
									<SelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
										<SelectValue placeholder="Language" />
									</SelectTrigger>
									<SelectContent className="rounded-xl">
										{TARGET_LANGUAGES.map((lang) => (
											<SelectItem key={lang.value} value={lang.value}>
												{lang.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Routing */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								<div className="flex items-center justify-between gap-3 p-2 rounded-2xl bg-muted/30 border border-border/60">
									<div className="flex items-center gap-2">
										<div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
											<Cpu className="h-4 w-4" />
										</div>
										<div>
											<h4 className="font-bold text-foreground text-xs">
												Provider
											</h4>
										</div>
									</div>
									<Select
										value={settings.summarizerProvider}
										onValueChange={(val) =>
											handleChange("summarizerProvider", val)
										}
									>
										<SelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
											<SelectValue placeholder="Auto" />
										</SelectTrigger>
										<SelectContent className="rounded-xl">
											<SelectItem value="auto">Auto</SelectItem>
											<SelectItem value="gemini">Gemini Native</SelectItem>
											<SelectItem value="llm">LLM</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="flex items-center justify-between gap-3 p-2 rounded-2xl bg-muted/30 border border-border/60">
									<div className="flex items-center gap-2">
										<div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
											<Sparkles className="h-4 w-4" />
										</div>
										<div>
											<h4 className="font-bold text-foreground text-xs">
												Mode
											</h4>
										</div>
									</div>
									<Select
										value={settings.summarizerMode}
										onValueChange={async (val) => {
											await handleChange("summarizerMode", val);
										}}
									>
										<SelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
											<SelectValue placeholder="Select mode" />
										</SelectTrigger>
										<SelectContent className="rounded-xl">
											<SelectItem value="native">Gemini Native</SelectItem>
											<SelectItem value="validation">
												Validation Agent
											</SelectItem>
											<SelectItem value="fast">Fast Agent</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* Toggles */}
							<div className="grid grid-cols-1 gap-2">
								<div className="flex items-center justify-between p-2 rounded-2xl bg-muted/30 border border-border/60">
									<div className="flex items-center gap-2">
										<div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
											<Sparkles className="h-4 w-4" />
										</div>
										<div>
											<h4 className="font-bold text-foreground text-xs">
												Auto-Generate Caption
											</h4>
										</div>
									</div>
									<Switch
										checked={settings.autoGenerate}
										onCheckedChange={(checked) =>
											handleChange("autoGenerate", checked)
										}
										className="data-[state=checked]:bg-primary scale-75"
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Appearance */}
					<RecommendationFilterSettings />

					<Card className="rounded-xl hover:border-primary/10 transition-all duration-500">
						<CardHeader className="p-4 pb-1">
							<div className="flex items-center gap-2 text-primary mb-0.5">
								<Type className="h-4 w-4" />
								<span className="text-xs font-bold uppercase tracking-widest">
									Font Size
								</span>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-1 space-y-2">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label className="text-[11px] text-muted-foreground uppercase ml-1">
										Caption Overlay
									</Label>
									{renderFontSizeSelector("captionFontSize")}
								</div>
								<div className="space-y-1.5">
									<Label className="text-[11px] text-muted-foreground uppercase ml-1">
										Summary Panel
									</Label>
									{renderFontSizeSelector("summaryFontSize")}
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
};

export default Settings;
