/**
 * Configuration Hook for YouTube Summarizer
 *
 * Provides centralized access to application configuration
 * with backend synchronization and local fallback.
 */

import { api } from "@ui/services/api";
import {
    AVAILABLE_MODELS,
    AVAILABLE_MODELS_LIST,
    AVAILABLE_REFINER_MODELS_LIST,
    AVAILABLE_SUMMARIZER_MODELS_LIST,
    type AvailableModel,
    DEFAULT_QUALITY_MODEL,
    DEFAULT_SUMMARY_MODEL,
    DEFAULT_TARGET_LANGUAGE,
    SUPPORTED_LANGUAGES,
    SUPPORTED_LANGUAGES_LIST,
    type SupportedLanguage,
} from "@ui/services/config";
import { fetchModelStats, type ModelStat } from "@ui/services/stats";
import type { ConfigurationResponse } from "@ui/services/types";
import { useEffect, useMemo, useState } from "react";

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

export function useConfig(): UseConfigReturn {
    const [config, setConfig] = useState<ConfigurationResponse | null>(null);
    const [stats, setStats] = useState<Record<string, ModelStat>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadConfig = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Load config and stats in parallel
            const [configuration, modelStats] = await Promise.all([
                api.getConfiguration().catch(() => null),
                fetchModelStats().catch(
                    () => ({}) as Record<string, ModelStat>,
                ),
            ]);

            if (configuration) {
                setConfig(configuration);
            } else {
                setConfig({
                    status: "success",
                    message: "Using local configuration fallback",
                    available_models: AVAILABLE_MODELS,
                    supported_languages: SUPPORTED_LANGUAGES,
                    default_summary_model: DEFAULT_SUMMARY_MODEL,
                    default_quality_model: DEFAULT_QUALITY_MODEL,
                    default_target_language: DEFAULT_TARGET_LANGUAGE,
                });
            }

            setStats(modelStats);
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

    const enrichedModels = useMemo(() => {
        return AVAILABLE_MODELS_LIST.map((model) => {
            const stat = stats[model.key];
            if (stat) {
                return {
                    ...model,
                    logo: stat.logo,
                    fallbackLogo: stat.fallbackLogo,
                };
            }

            // Fallback for models not in stats API but with a known provider
            if (model.provider) {
                const cleanId = model.provider.toLowerCase();
                const aaId = cleanId.replace(/[^a-z0-9]/g, "");
                return {
                    ...model,
                    logo: `https://artificialanalysis.ai/img/logos/${aaId}_small.svg`,
                    fallbackLogo: `https://models.dev/logos/${cleanId}.svg`,
                };
            }

            return model;
        });
    }, [stats]);

    const summarizerModels = useMemo(
        () =>
            enrichedModels.filter((m) =>
                AVAILABLE_SUMMARIZER_MODELS_LIST.some((sm) => sm.key === m.key),
            ),
        [enrichedModels],
    );

    const refinerModels = useMemo(
        () =>
            enrichedModels.filter((m) =>
                AVAILABLE_REFINER_MODELS_LIST.some((rm) => rm.key === m.key),
            ),
        [enrichedModels],
    );

    const isValidModel = (model: string) =>
        config?.available_models
            ? model in config.available_models
            : model in AVAILABLE_MODELS;

    const isValidLanguage = (language: string) =>
        config?.supported_languages
            ? language in config.supported_languages
            : language in SUPPORTED_LANGUAGES;

    return {
        config,
        models: enrichedModels,
        summarizerModels,
        refinerModels,
        languages: SUPPORTED_LANGUAGES_LIST,
        isLoading,
        error,
        getModelByKey: (key: string) =>
            enrichedModels.find((m) => m.key === key),
        getLanguageByKey: (key: string) =>
            SUPPORTED_LANGUAGES_LIST.find((l) => l.key === key),
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

import { STORAGE_KEYS } from "@/core/constants";
import { setStorageValue } from "@/core/storage";

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
        // Load preferences from chrome.storage.local
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

        // Listen for changes from other parts of the extension
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
            if (changes[STORAGE_KEYS.SUMMARIZER_MODE])
                updates.summarizerMode =
                    changes[STORAGE_KEYS.SUMMARIZER_MODE].newValue;
            if (changes[STORAGE_KEYS.QUALITY_MODEL])
                updates.qualityModel =
                    changes[STORAGE_KEYS.QUALITY_MODEL].newValue;

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

        // Sync to chrome.storage.local
        const storageUpdates: Record<string, any> = {};
        if (updates.summaryModel)
            storageUpdates[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] =
                updates.summaryModel;
        if (updates.targetLanguage)
            storageUpdates[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] =
                updates.targetLanguage;
        if (updates.summarizerMode)
            storageUpdates[STORAGE_KEYS.SUMMARIZER_MODE] =
                updates.summarizerMode;
        if (updates.qualityModel)
            storageUpdates[STORAGE_KEYS.QUALITY_MODEL] = updates.qualityModel;

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
