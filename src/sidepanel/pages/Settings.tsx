import { Input } from "@ui/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { useModelSelection } from "@ui/hooks/use-config";
import { useToast } from "@ui/hooks/use-toast";
import { Bot, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadConfig, normalizeModelCostLimit } from "@/core/config";
import type { FontSize } from "@/core/constants";
import { MESSAGE_ACTIONS } from "@/core/constants";
import { ensureLlmBaseUrlHostPermission } from "@/core/llmHostPermissions";
import {
	clearStoredDataExceptSettings,
	getStorageValue,
	setStorageValue,
} from "@/core/storage";
import { applySummaryFontSize } from "../lib/font-size";
import {
	clampModelCostLimit,
	modelCostLimitBounds,
	resolveVisibleModelKey,
} from "./settings/modelCostLimit";
import {
	ApiConfigurationSection,
	AppearanceSettingsSection,
	GenerationSettingsSection,
	ModelConfigurationSection,
	SettingsLoadingView,
	SettingsTopbar,
	StorageSettingsSection,
} from "./settings/SettingsSections";
import {
	DEFAULT_MODEL_COST_LIMIT_INPUTS,
	DEFAULT_SETTINGS,
	type ModelCostLimitInputs,
	type ModelCostLimitKey,
	type ModelSelectorConfig,
	SETTINGS_STORAGE_KEYS,
	type SettingsState,
} from "./settings/settingsTypes";

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
	const [isClearingStorage, setIsClearingStorage] = useState(false);
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
					llmModelPrefixMode: config.llmModelPrefixMode,
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

	const renderModelCostLimitControl = (selectorConfig: ModelSelectorConfig) => (
		<>
			<span className="text-[10px] font-semibold text-muted-foreground">≤</span>
			<Tooltip delayDuration={0}>
				<TooltipTrigger asChild>
					<Input
						type="number"
						min={selectorConfig.costLimitBounds.min}
						max={selectorConfig.costLimitBounds.max}
						step="0.1"
						value={modelCostLimitInputs[selectorConfig.costLimitKey]}
						onChange={(event) =>
							handleModelCostLimitInputChange(
								selectorConfig.costLimitKey,
								event.target.value,
								selectorConfig.priceRange,
							)
						}
						onBlur={() => {
							void commitModelCostLimit(
								selectorConfig.costLimitKey,
								modelCostLimitInputs[selectorConfig.costLimitKey],
								selectorConfig.priceRange,
							);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.currentTarget.blur();
						}}
						className="h-6 w-14 rounded-sm border-0 bg-transparent px-1 text-right text-xs shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
						aria-label={selectorConfig.costLimitAriaLabel}
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

	const ensureLlmBaseUrlPermission = async (baseUrl: string) => {
		try {
			const permissionStatus = await ensureLlmBaseUrlHostPermission(baseUrl);
			if (permissionStatus === "denied") {
				toast({
					title: "LLM domain not allowed",
					description:
						"Allow this domain so the extension can call the custom LLM endpoint.",
					variant: "destructive",
				});
			} else if (permissionStatus === "invalid") {
				toast({
					title: "Invalid LLM Base URL",
					description: "Use a full URL like https://api.example.com/v1.",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Failed to request LLM host permission:", error);
			toast({
				title: "Couldn't allow LLM domain",
				description:
					error instanceof Error
						? error.message
						: "The browser did not grant endpoint access.",
				variant: "destructive",
			});
		}
	};

	const handleClearStoredData = async () => {
		if (
			!window.confirm(
				"Clear saved transcripts, summaries, video details, and caches? API keys and settings will stay saved.",
			)
		) {
			return;
		}

		setIsClearingStorage(true);
		try {
			const result = await clearStoredDataExceptSettings();
			const totalRemoved = result.localKeysRemoved + result.sessionKeysRemoved;
			toast({
				title: "Storage cleared",
				description: `${totalRemoved} cached item${totalRemoved === 1 ? "" : "s"} removed.`,
			});
		} catch (error) {
			console.error("Failed to clear stored data:", error);
			toast({
				title: "Couldn't clear storage",
				description:
					error instanceof Error
						? error.message
						: "Cached data was not removed.",
				variant: "destructive",
			});
		} finally {
			setIsClearingStorage(false);
		}
	};

	if (isLoading) {
		return <SettingsLoadingView />;
	}

	return (
		<div className="app-shell pb-10">
			<SettingsTopbar />

			<div className="sidepanel-container pt-24">
				<div className="grid grid-cols-1 gap-8 fade-in-up stagger-1">
					<ApiConfigurationSection
						settings={settings}
						onChange={handleChange}
						onLlmBaseUrlBlur={(baseUrl) => {
							void ensureLlmBaseUrlPermission(baseUrl);
						}}
					/>
					<ModelConfigurationSection
						settings={settings}
						selectorConfigs={selectorConfigs}
						renderModelCostLimitControl={renderModelCostLimitControl}
						onChange={handleChange}
					/>
					<GenerationSettingsSection
						settings={settings}
						onChange={handleChange}
					/>
					<AppearanceSettingsSection
						settings={settings}
						onChange={handleChange}
					/>
					<StorageSettingsSection
						isClearingStorage={isClearingStorage}
						onClearStoredData={() => {
							void handleClearStoredData();
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default Settings;
