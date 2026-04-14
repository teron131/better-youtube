/**
 * Configuration Hook for YouTube Summarizer
 *
 * Provides centralized access to application configuration
 * with backend synchronization and dynamic model loading.
 */

import { api } from "@ui/services/api";
import {
	type AvailableModel,
	DEFAULT_QUALITY_MODEL,
	DEFAULT_SUMMARY_MODEL,
	DEFAULT_TARGET_LANGUAGE,
	SUPPORTED_LANGUAGES,
	SUPPORTED_LANGUAGES_LIST,
	type SupportedLanguage,
} from "@ui/services/config";
import {
	fetchDynamicModels,
	fetchLeaderboardProviderLogos,
	fetchLeaderboardScores,
	fetchModelStats,
	type LeaderboardStat,
	type ModelStat,
	normalizeOpenRouterModelId,
	type ProviderLogoStat,
} from "@ui/services/stats";
import type { ConfigurationResponse } from "@ui/services/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeModelCostLimit } from "@/core/config";
import { DEFAULTS, STORAGE_KEYS } from "@/core/constants";
import { getStorageValues, setStorageValue } from "@/core/storage";

const DEFAULT_CONFIGURATION_RESPONSE: ConfigurationResponse = {
	status: "success",
	message: "Using local configuration fallback",
	available_models: {},
	supported_languages: SUPPORTED_LANGUAGES,
	default_summary_model: DEFAULT_SUMMARY_MODEL,
	default_quality_model: DEFAULT_QUALITY_MODEL,
	default_target_language: DEFAULT_TARGET_LANGUAGE,
};

const USER_PREFERENCE_STORAGE_KEYS = [
	STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
	STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
	STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
	STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
	STORAGE_KEYS.SUMMARIZER_MODE,
	STORAGE_KEYS.QUALITY_MODEL,
] as const;

interface UseConfigReturn {
	config: ConfigurationResponse | null;
	models: AvailableModel[];
	summarizerModels: AvailableModel[];
	refinerModels: AvailableModel[];
	allSummarizerModels: AvailableModel[];
	allRefinerModels: AvailableModel[];
	modelPriceRange: {
		min: number | null;
		max: number | null;
	};
	languages: SupportedLanguage[];
	isLoading: boolean;
	error: string | null;
	getModelByKey: (key: string) => AvailableModel | undefined;
	getLanguageByKey: (key: string) => SupportedLanguage | undefined;
	isValidModel: (model: string) => boolean;
	isValidLanguage: (language: string) => boolean;
	refresh: () => Promise<void>;
}

type UserPreferenceStorageResult = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function summarizerModeValue(
	value: unknown,
): UserPreferences["summarizerMode"] | undefined {
	return value === "native" || value === "validation" || value === "fast"
		? value
		: undefined;
}

function hasConfiguredModels(config: ConfigurationResponse | null): boolean {
	return Object.keys(config?.available_models ?? {}).length > 0;
}

function applyModelMetadata(
	models: AvailableModel[],
	stats: Record<string, ModelStat>,
	leaderboardScores: Record<string, LeaderboardStat>,
	providerLogos: Record<string, ProviderLogoStat>,
): AvailableModel[] {
	return models.map((model) => {
		const stat = stats[model.key];
		const scoreKey = normalizeOpenRouterModelId(model.key);
		const score = leaderboardScores[scoreKey];
		const providerKey = (model.provider ?? stat?.provider)?.toLowerCase();
		const providerLogo = providerKey ? providerLogos[providerKey] : undefined;

		const baseModel = {
			...model,
			intelligenceScore: score?.intelligenceScore ?? null,
			speedMetric: score?.speedMetric ?? null,
		};

		if (providerLogo?.logo) {
			return {
				...baseModel,
				logo: providerLogo.logo,
				fallbackLogo: stat?.logo || "",
			};
		}

		if (!stat) {
			return baseModel;
		}

		return {
			...baseModel,
			logo: stat.logo,
			fallbackLogo: stat.fallbackLogo,
		};
	});
}

function rankingValue(
	model: AvailableModel,
	key: "intelligenceScore" | "speedMetric",
): number {
	const value = model[key];
	return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
}

function sortModelsByMetric(
	models: AvailableModel[],
	key: "intelligenceScore" | "speedMetric",
): AvailableModel[] {
	return [...models].sort((left, right) => {
		const leftValue = rankingValue(left, key);
		const rightValue = rankingValue(right, key);

		if (leftValue !== rightValue) {
			return rightValue - leftValue;
		}

		return (left.label || left.key).localeCompare(right.label || right.key);
	});
}

function modelPriceRange(models: AvailableModel[]): {
	min: number | null;
	max: number | null;
} {
	const prices = models
		.map((model) => model.price)
		.filter(
			(price): price is number => price != null && Number.isFinite(price),
		);

	if (prices.length === 0) {
		return { min: null, max: null };
	}

	return {
		min: Math.min(...prices),
		max: Math.max(...prices),
	};
}

async function getStoredModelCostLimit(): Promise<number> {
	const result = await getStorageValues<Record<string, unknown>>([
		STORAGE_KEYS.MODEL_COST_LIMIT,
	]);
	return normalizeModelCostLimit(result[STORAGE_KEYS.MODEL_COST_LIMIT]);
}

function storagePreferences(
	result: UserPreferenceStorageResult,
): Partial<UserPreferences> {
	return {
		summaryModel:
			stringValue(result[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL]) ||
			stringValue(result[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL]),
		targetLanguage:
			stringValue(result[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM]) ||
			stringValue(result[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED]),
		summarizerMode: summarizerModeValue(result[STORAGE_KEYS.SUMMARIZER_MODE]),
		qualityModel: stringValue(result[STORAGE_KEYS.QUALITY_MODEL]),
	};
}

function storagePreferenceUpdates(
	changes: Record<string, chrome.storage.StorageChange>,
): Partial<UserPreferences> {
	const summaryModelChange =
		changes[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
		changes[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL];
	const targetLanguageChange =
		changes[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
		changes[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED];

	const updates: Partial<UserPreferences> = {};

	if (summaryModelChange) {
		updates.summaryModel = summaryModelChange.newValue;
	}
	if (targetLanguageChange) {
		updates.targetLanguage = targetLanguageChange.newValue;
	}
	if (changes[STORAGE_KEYS.SUMMARIZER_MODE]) {
		updates.summarizerMode = changes[STORAGE_KEYS.SUMMARIZER_MODE].newValue;
	}
	if (changes[STORAGE_KEYS.QUALITY_MODEL]) {
		updates.qualityModel = changes[STORAGE_KEYS.QUALITY_MODEL].newValue;
	}

	return updates;
}

function storageUpdatesFromPreferences(
	updates: Partial<UserPreferences>,
): Record<string, unknown> {
	const storageUpdates: Record<string, unknown> = {};

	if (updates.summaryModel) {
		storageUpdates[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] = updates.summaryModel;
	}
	if (updates.targetLanguage) {
		storageUpdates[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] =
			updates.targetLanguage;
	}
	if (updates.summarizerMode) {
		storageUpdates[STORAGE_KEYS.SUMMARIZER_MODE] = updates.summarizerMode;
	}
	if (updates.qualityModel) {
		storageUpdates[STORAGE_KEYS.QUALITY_MODEL] = updates.qualityModel;
	}

	return storageUpdates;
}

export function useConfig(): UseConfigReturn {
	const [config, setConfig] = useState<ConfigurationResponse | null>(null);
	const [stats, setStats] = useState<Record<string, ModelStat>>({});
	const [leaderboardScores, setLeaderboardScores] = useState<
		Record<string, LeaderboardStat>
	>({});
	const [providerLogos, setProviderLogos] = useState<
		Record<string, ProviderLogoStat>
	>({});
	const [dynamicModels, setDynamicModels] = useState<AvailableModel[]>([]);
	const [modelCostLimit, setModelCostLimit] = useState<number>(
		DEFAULTS.MODEL_COST_LIMIT,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadConfig = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const [
				configuration,
				modelStats,
				scores,
				fetchedProviderLogos,
				fetchedDynamicModels,
			] = await Promise.all([
				api.getConfiguration().catch(() => null),
				fetchModelStats().catch(() => ({}) as Record<string, ModelStat>),
				fetchLeaderboardScores().catch(
					() => ({}) as Record<string, LeaderboardStat>,
				),
				fetchLeaderboardProviderLogos().catch(
					() => ({}) as Record<string, ProviderLogoStat>,
				),
				fetchDynamicModels().catch(() => [] as AvailableModel[]),
			]);

			setConfig(configuration ?? DEFAULT_CONFIGURATION_RESPONSE);

			setStats(modelStats);
			setLeaderboardScores(scores);
			setProviderLogos(fetchedProviderLogos);
			setDynamicModels(fetchedDynamicModels);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load configuration",
			);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadConfig();
	}, [loadConfig]);

	useEffect(() => {
		let isActive = true;

		void getStoredModelCostLimit().then((storedModelCostLimit) => {
			if (!isActive) return;
			setModelCostLimit(storedModelCostLimit);
		});

		const listener = (
			changes: Record<string, chrome.storage.StorageChange>,
			areaName: string,
		) => {
			if (areaName !== "local") return;
			if (!changes[STORAGE_KEYS.MODEL_COST_LIMIT]) return;

			setModelCostLimit(
				normalizeModelCostLimit(
					changes[STORAGE_KEYS.MODEL_COST_LIMIT].newValue,
				),
			);
		};

		chrome.storage.onChanged.addListener(listener);
		return () => {
			isActive = false;
			chrome.storage.onChanged.removeListener(listener);
		};
	}, []);

	const enrichedModels = useMemo(
		() =>
			applyModelMetadata(
				dynamicModels,
				stats,
				leaderboardScores,
				providerLogos,
			),
		[dynamicModels, stats, leaderboardScores, providerLogos],
	);
	const availablePriceRange = useMemo(
		() => modelPriceRange(enrichedModels),
		[enrichedModels],
	);
	const costLimitedModels = useMemo(
		() =>
			enrichedModels.filter(
				(model) =>
					typeof model.price !== "number" || model.price <= modelCostLimit,
			),
		[enrichedModels, modelCostLimit],
	);

	const allSummarizerModels = useMemo(
		() => sortModelsByMetric(enrichedModels, "intelligenceScore"),
		[enrichedModels],
	);
	const allRefinerModels = useMemo(
		() => sortModelsByMetric(enrichedModels, "speedMetric"),
		[enrichedModels],
	);
	const models = useMemo(
		() =>
			allSummarizerModels.filter(
				(model) =>
					typeof model.price !== "number" || model.price <= modelCostLimit,
			),
		[allSummarizerModels, modelCostLimit],
	);

	const summarizerModels = models;

	const refinerModels = useMemo(
		() =>
			allRefinerModels.filter(
				(model) =>
					typeof model.price !== "number" || model.price <= modelCostLimit,
			),
		[allRefinerModels, modelCostLimit],
	);

	const isValidModel = (model: string) => {
		if (dynamicModels.some((candidate) => candidate.key === model)) {
			return true;
		}
		return hasConfiguredModels(config)
			? model in (config?.available_models ?? {})
			: model.length > 0;
	};

	const isValidLanguage = (language: string) =>
		config?.supported_languages
			? language in config.supported_languages
			: language in SUPPORTED_LANGUAGES;

	return {
		config,
		models,
		summarizerModels,
		refinerModels,
		allSummarizerModels,
		allRefinerModels,
		modelPriceRange: availablePriceRange,
		languages: SUPPORTED_LANGUAGES_LIST,
		isLoading,
		error,
		getModelByKey: (key: string) =>
			models.find((candidate) => candidate.key === key),
		getLanguageByKey: (key: string) =>
			SUPPORTED_LANGUAGES_LIST.find((candidate) => candidate.key === key),
		isValidModel,
		isValidLanguage,
		refresh: loadConfig,
	};
}

export function useModelSelection() {
	const {
		models,
		summarizerModels,
		refinerModels,
		allSummarizerModels,
		allRefinerModels,
		modelPriceRange,
		getModelByKey,
		isValidModel,
	} = useConfig();

	return {
		models,
		summarizerModels,
		refinerModels,
		allSummarizerModels,
		allRefinerModels,
		modelPriceRange,
		getModelByKey,
		isValidModel,
		defaultModel: DEFAULT_SUMMARY_MODEL,
		defaultQualityModel: DEFAULT_QUALITY_MODEL,
	};
}

export function useLanguageSelection() {
	const { languages, getLanguageByKey, isValidLanguage } = useConfig();

	return {
		languages,
		getLanguageByKey,
		isValidLanguage,
		defaultLanguage: DEFAULT_TARGET_LANGUAGE,
		supportsTranslation: languages.length > 0,
	};
}

interface UserPreferences {
	summaryModel: string;
	qualityModel: string;
	targetLanguage: string;
	summarizerMode: "native" | "validation" | "fast";
}

const DEFAULT_USER_PREFERENCES: UserPreferences = {
	summaryModel: DEFAULT_SUMMARY_MODEL,
	qualityModel: DEFAULT_QUALITY_MODEL,
	targetLanguage: DEFAULT_TARGET_LANGUAGE || "auto",
	summarizerMode: "validation",
};

export function useUserPreferences() {
	const [preferences, setPreferences] = useState<UserPreferences>(
		DEFAULT_USER_PREFERENCES,
	);
	const [isLoaded, setIsLoaded] = useState(false);
	const hasLocalEditsRef = useRef(false);
	const { isValidModel, isValidLanguage } = useConfig();

	const validatePreferences = useCallback(
		(prefs: Partial<UserPreferences>, defaults: UserPreferences) => {
			return {
				summaryModel:
					prefs.summaryModel && isValidModel(prefs.summaryModel)
						? prefs.summaryModel
						: defaults.summaryModel,
				qualityModel:
					prefs.qualityModel && isValidModel(prefs.qualityModel)
						? prefs.qualityModel
						: defaults.qualityModel,
				targetLanguage:
					prefs.targetLanguage && isValidLanguage(prefs.targetLanguage)
						? prefs.targetLanguage
						: defaults.targetLanguage,
				summarizerMode:
					prefs.summarizerMode === "native" ||
					prefs.summarizerMode === "validation" ||
					prefs.summarizerMode === "fast"
						? prefs.summarizerMode
						: defaults.summarizerMode,
			};
		},
		[isValidModel, isValidLanguage],
	);

	useEffect(() => {
		chrome.storage.local.get(USER_PREFERENCE_STORAGE_KEYS, (result) => {
			if (!hasLocalEditsRef.current) {
				setPreferences(
					validatePreferences(
						storagePreferences(result),
						DEFAULT_USER_PREFERENCES,
					),
				);
			}
			setIsLoaded(true);
		});

		const listener = (
			changes: Record<string, chrome.storage.StorageChange>,
		) => {
			const updates = storagePreferenceUpdates(changes);
			if (Object.keys(updates).length > 0) {
				setPreferences((prev) =>
					validatePreferences(
						{ ...prev, ...updates },
						DEFAULT_USER_PREFERENCES,
					),
				);
			}
		};

		chrome.storage.onChanged.addListener(listener);
		return () => chrome.storage.onChanged.removeListener(listener);
	}, [validatePreferences]);

	const updatePreferences = (updates: Partial<UserPreferences>) => {
		hasLocalEditsRef.current = true;
		const newPrefs = { ...preferences, ...updates };
		setPreferences(newPrefs);

		const storageUpdates = storageUpdatesFromPreferences(updates);
		const writeEntries = Object.entries(storageUpdates);
		if (writeEntries.length === 0) return;

		void Promise.all(
			writeEntries.map(([key, value]) => setStorageValue(key, value)),
		).catch((error) => {
			console.error("Failed to sync user preferences:", error);
		});
	};

	const resetPreferences = () => {
		setPreferences(DEFAULT_USER_PREFERENCES);
		chrome.storage.local.remove([
			STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
			STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
			STORAGE_KEYS.SUMMARIZER_MODE,
			STORAGE_KEYS.QUALITY_MODEL,
		]);
	};

	return {
		preferences,
		updatePreferences,
		resetPreferences,
		isLoaded,
	};
}
