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
    fetchLeaderboardScores,
    fetchModelStats,
    type LeaderboardStat,
    type ModelStat,
    normalizeOpenRouterModelId,
} from "@ui/services/stats";
import type { ConfigurationResponse } from "@ui/services/types";
import { useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/core/constants";
import { setStorageValue } from "@/core/storage";

interface UseConfigReturn {
    config: ConfigurationResponse | null;
    models: AvailableModel[];
    summarizerModels: AvailableModel[];
    refinerModels: AvailableModel[];
    languages: SupportedLanguage[];
    isLoading: boolean;
    error: string | null;
    getModelByKey: (key: string) => AvailableModel | undefined;
    getLanguageByKey: (key: string) => SupportedLanguage | undefined;
    isValidModel: (model: string) => boolean;
    isValidLanguage: (language: string) => boolean;
    refresh: () => Promise<void>;
}

const MODEL_LIMIT = 15;

function applyModelMetadata(
    models: AvailableModel[],
    stats: Record<string, ModelStat>,
    leaderboardScores: Record<string, LeaderboardStat>,
): AvailableModel[] {
    return models.map((model) => {
        const stat = stats[model.key];
        const scoreKey = normalizeOpenRouterModelId(model.key);
        const score = leaderboardScores[scoreKey];

        if (stat) {
            return {
                ...model,
                logo: stat.logo,
                fallbackLogo: stat.fallbackLogo,
                intelligenceScore: score?.intelligenceScore ?? null,
                speedScore: score?.speedScore ?? null,
            };
        }

        if (model.provider) {
            const cleanId = model.provider.toLowerCase();
            const aaId = cleanId.replace(/[^a-z0-9]/g, "");
            return {
                ...model,
                logo: `https://artificialanalysis.ai/img/logos/${aaId}_small.svg`,
                fallbackLogo: `https://models.dev/logos/${cleanId}.svg`,
                intelligenceScore: score?.intelligenceScore ?? null,
                speedScore: score?.speedScore ?? null,
            };
        }

        return {
            ...model,
            intelligenceScore: score?.intelligenceScore ?? null,
            speedScore: score?.speedScore ?? null,
        };
    });
}

function scoreValue(
    model: AvailableModel,
    key: "intelligenceScore" | "speedScore",
): number {
    const value = model[key];
    return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
}

function sortModelsByScore(
    models: AvailableModel[],
    key: "intelligenceScore" | "speedScore",
): AvailableModel[] {
    return [...models].sort((left, right) => {
        const leftScore = scoreValue(left, key);
        const rightScore = scoreValue(right, key);

        if (leftScore !== rightScore) {
            return rightScore - leftScore;
        }

        return (left.label || left.key).localeCompare(right.label || right.key);
    });
}

function topModelsByScore(
    models: AvailableModel[],
    key: "intelligenceScore" | "speedScore",
    limit = MODEL_LIMIT,
): AvailableModel[] {
    return sortModelsByScore(models, key).slice(0, limit);
}

export function useConfig(): UseConfigReturn {
    const [config, setConfig] = useState<ConfigurationResponse | null>(null);
    const [stats, setStats] = useState<Record<string, ModelStat>>({});
    const [leaderboardScores, setLeaderboardScores] = useState<
        Record<string, LeaderboardStat>
    >({});
    const [dynamicModels, setDynamicModels] = useState<AvailableModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadConfig = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const [configuration, modelStats, scores, fetchedDynamicModels] =
                await Promise.all([
                    api.getConfiguration().catch(() => null),
                    fetchModelStats().catch(
                        () => ({}) as Record<string, ModelStat>,
                    ),
                    fetchLeaderboardScores().catch(
                        () => ({}) as Record<string, LeaderboardStat>,
                    ),
                    fetchDynamicModels().catch(() => [] as AvailableModel[]),
                ]);

            if (configuration) {
                setConfig(configuration);
            } else {
                setConfig({
                    status: "success",
                    message: "Using local configuration fallback",
                    available_models: {},
                    supported_languages: SUPPORTED_LANGUAGES,
                    default_summary_model: DEFAULT_SUMMARY_MODEL,
                    default_quality_model: DEFAULT_QUALITY_MODEL,
                    default_target_language: DEFAULT_TARGET_LANGUAGE,
                });
            }

            setStats(modelStats);
            setLeaderboardScores(scores);
            setDynamicModels(fetchedDynamicModels);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load configuration",
            );
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    const enrichedModels = useMemo(
        () => applyModelMetadata(dynamicModels, stats, leaderboardScores),
        [dynamicModels, stats, leaderboardScores],
    );

    const models = useMemo(
        () => sortModelsByScore(enrichedModels, "intelligenceScore"),
        [enrichedModels],
    );

    const summarizerModels = useMemo(
        () => topModelsByScore(enrichedModels, "intelligenceScore"),
        [enrichedModels],
    );

    const refinerModels = useMemo(
        () => topModelsByScore(enrichedModels, "speedScore"),
        [enrichedModels],
    );

    const isValidModel = (model: string) => {
        if (dynamicModels.some((candidate) => candidate.key === model)) {
            return true;
        }
        return config?.available_models
            ? model in config.available_models
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
        getModelByKey,
        isValidModel,
    } = useConfig();

    return {
        models,
        summarizerModels,
        refinerModels,
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
    const { isValidModel, isValidLanguage } = useConfig();

    const validatePreferences = (
        prefs: Partial<UserPreferences>,
        defaults: UserPreferences,
    ): UserPreferences => {
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
    };

    useEffect(() => {
        const keys = [
            STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
            STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
            STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
            STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
            STORAGE_KEYS.SUMMARIZER_MODE,
            STORAGE_KEYS.QUALITY_MODEL,
        ];

        chrome.storage.local.get(keys, (result) => {
            const loadedPrefs: Partial<UserPreferences> = {
                summaryModel:
                    result[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
                    result[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL],
                targetLanguage:
                    result[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
                    result[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED],
                summarizerMode: result[STORAGE_KEYS.SUMMARIZER_MODE],
                qualityModel: result[STORAGE_KEYS.QUALITY_MODEL],
            };

            setPreferences(
                validatePreferences(loadedPrefs, DEFAULT_USER_PREFERENCES),
            );
            setIsLoaded(true);
        });

        const listener = (changes: {
            [key: string]: chrome.storage.StorageChange;
        }) => {
            const updates: Partial<UserPreferences> = {};
            if (
                changes[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
                changes[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL]
            ) {
                updates.summaryModel = (
                    changes[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] ||
                    changes[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL]
                ).newValue;
            }
            if (
                changes[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
                changes[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED]
            ) {
                updates.targetLanguage = (
                    changes[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] ||
                    changes[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED]
                ).newValue;
            }
            if (changes[STORAGE_KEYS.SUMMARIZER_MODE]) {
                updates.summarizerMode =
                    changes[STORAGE_KEYS.SUMMARIZER_MODE].newValue;
            }
            if (changes[STORAGE_KEYS.QUALITY_MODEL]) {
                updates.qualityModel =
                    changes[STORAGE_KEYS.QUALITY_MODEL].newValue;
            }

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
    }, [isValidModel, isValidLanguage]);

    const updatePreferences = (updates: Partial<UserPreferences>) => {
        const newPrefs = { ...preferences, ...updates };
        setPreferences(newPrefs);

        const storageUpdates: Record<string, unknown> = {};
        if (updates.summaryModel) {
            storageUpdates[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] =
                updates.summaryModel;
        }
        if (updates.targetLanguage) {
            storageUpdates[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] =
                updates.targetLanguage;
        }
        if (updates.summarizerMode) {
            storageUpdates[STORAGE_KEYS.SUMMARIZER_MODE] =
                updates.summarizerMode;
        }
        if (updates.qualityModel) {
            storageUpdates[STORAGE_KEYS.QUALITY_MODEL] = updates.qualityModel;
        }

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
