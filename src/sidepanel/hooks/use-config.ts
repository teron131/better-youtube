/**
 * Configuration Hook for YouTube Summarizer
 *
 * Provides centralized access to application configuration
 * with backend synchronization and dynamic model loading.
 */

import { sortModelsByRankKey } from "@ui/lib/model-sort";
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
  fetchLlmStatsModelMetadataIndex,
  type LlmStatsModelMetadata,
  type LlmStatsModelMetadataIndex,
  normalizeOpenRouterModelId,
} from "@ui/services/stats";
import type { ConfigurationResponse } from "@ui/services/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeModelCostLimit } from "@/core/config";
import { DEFAULTS, STORAGE_KEYS } from "@/core/constants";
import { getStorageValue, getStorageValues, setStorageValue } from "@/core/storage";

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

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const PRICE_PER_MILLION_TOKENS = 1_000_000;
const INPUT_PRICE_WEIGHT = 3;
const OUTPUT_PRICE_WEIGHT = 1;
const DYNAMIC_MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OPTIONAL_STATS_METADATA_TIMEOUT_MS = 8_000;

type OpenRouterModel = {
  id: string;
  name: string;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

const FALLBACK_DYNAMIC_MODELS: AvailableModel[] = [
  ...new Set([DEFAULT_SUMMARY_MODEL, DEFAULT_QUALITY_MODEL]),
].map((modelKey) => {
  const separatorIndex = modelKey.indexOf("/");
  return {
    key: modelKey,
    label: modelKey,
    provider: separatorIndex > 0 ? modelKey.slice(0, separatorIndex) : undefined,
    recommended: false,
    price: null,
  };
});

let dynamicModelsPromise: Promise<AvailableModel[]> | null = null;

type DynamicModelsCache = {
  fetchedAtMs: number;
  models: AvailableModel[];
};

interface UseConfigReturn {
  config: ConfigurationResponse | null;
  summarizerModels: AvailableModel[];
  refinerModels: AvailableModel[];
  allSummarizerModels: AvailableModel[];
  allRefinerModels: AvailableModel[];
  summarizerModelPriceRange: {
    min: number | null;
    max: number | null;
  };
  refinerModelPriceRange: {
    min: number | null;
    max: number | null;
  };
  languages: SupportedLanguage[];
  isLoading: boolean;
  error: string | null;
  isValidSummarizerModel: (model: string) => boolean;
  isValidRefinerModel: (model: string) => boolean;
  isValidLanguage: (language: string) => boolean;
  refresh: () => Promise<void>;
}

interface UseConfigOptions {
  loadDynamicModels?: boolean;
}

type UserPreferenceStorageResult = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function summarizerModeValue(value: unknown): UserPreferences["summarizerMode"] | undefined {
  return value === "native" || value === "validation" || value === "fast" ? value : undefined;
}

function hasConfiguredModels(config: ConfigurationResponse | null): boolean {
  return Object.keys(config?.available_models ?? {}).length > 0;
}

function parseModelCostPerMillion(model: OpenRouterModel): number {
  const inputCost = parseFloat(model.pricing?.prompt || "0");
  const outputCost = parseFloat(model.pricing?.completion || "0");
  return (
    ((inputCost * INPUT_PRICE_WEIGHT + outputCost * OUTPUT_PRICE_WEIGHT) /
      (INPUT_PRICE_WEIGHT + OUTPUT_PRICE_WEIGHT)) *
    PRICE_PER_MILLION_TOKENS
  );
}

function outputsImages(model: OpenRouterModel): boolean {
  const outputModalities = model.architecture?.output_modalities ?? [];
  if (outputModalities.includes("image")) {
    return true;
  }

  const modality = model.architecture?.modality?.toLowerCase() ?? "";
  return modality.includes("->") && modality.endsWith("image");
}

function isSupportedTextModel(model: OpenRouterModel): boolean {
  if (outputsImages(model)) {
    return false;
  }

  return parseModelCostPerMillion(model) > 0;
}

function availableModelFromOpenRouterModel(
  model: OpenRouterModel,
  llmStatsModelMetadataById: Record<string, LlmStatsModelMetadata>,
): AvailableModel {
  const blendedPrice = parseModelCostPerMillion(model);
  const provider = model.id.split("/")[0] || "";
  const llmStatsModelMetadata = llmStatsModelMetadataById[normalizeOpenRouterModelId(model.id)];

  return {
    key: model.id,
    label: `${model.name} ($${blendedPrice.toFixed(2)})`,
    provider,
    recommended: true,
    price: blendedPrice,
    ...llmStatsModelMetadata,
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeOptionalNumber(value: unknown): number | null | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAvailableModel(value: unknown): AvailableModel | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string" || typeof record.label !== "string") {
    return null;
  }

  return {
    key: record.key,
    label: record.label,
    provider: normalizeOptionalString(record.provider),
    recommended: typeof record.recommended === "boolean" ? record.recommended : undefined,
    intelligenceScore: normalizeOptionalNumber(record.intelligenceScore),
    speedMetric: normalizeOptionalNumber(record.speedMetric),
    price: normalizeOptionalNumber(record.price),
  };
}

function normalizeDynamicModelsCache(value: unknown): DynamicModelsCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.fetchedAtMs !== "number" || !Number.isFinite(record.fetchedAtMs)) {
    return null;
  }

  if (!Array.isArray(record.models)) {
    return null;
  }

  const models = record.models
    .map((model) => normalizeAvailableModel(model))
    .filter((model): model is AvailableModel => model !== null);

  return {
    fetchedAtMs: record.fetchedAtMs,
    models,
  };
}

function hasModelSortScores(models: AvailableModel[]): boolean {
  return models.some(
    (model) => typeof model.intelligenceScore === "number" || typeof model.speedMetric === "number",
  );
}

function isDynamicModelsCacheUsable(cache: DynamicModelsCache | null): boolean {
  return (
    cache != null &&
    cache.models.length > 0 &&
    Date.now() - cache.fetchedAtMs <= DYNAMIC_MODELS_CACHE_TTL_MS &&
    hasModelSortScores(cache.models)
  );
}

async function loadDynamicModelsCache(): Promise<DynamicModelsCache | null> {
  const cachedValue = await getStorageValue<unknown>(STORAGE_KEYS.DYNAMIC_MODELS_CACHE);
  return normalizeDynamicModelsCache(cachedValue);
}

async function saveDynamicModelsCache(models: AvailableModel[]): Promise<void> {
  if (models.length === 0 || !models.some((model) => model.recommended)) {
    return;
  }

  await setStorageValue<DynamicModelsCache>(STORAGE_KEYS.DYNAMIC_MODELS_CACHE, {
    fetchedAtMs: Date.now(),
    models,
  });
}

async function fetchDynamicModels(): Promise<AvailableModel[]> {
  try {
    if (!dynamicModelsPromise) {
      dynamicModelsPromise = Promise.all([
        fetch(OPENROUTER_MODELS_URL),
        Promise.race([
          fetchLlmStatsModelMetadataIndex(),
          new Promise<LlmStatsModelMetadataIndex>((resolve) => {
            globalThis.setTimeout(
              () =>
                resolve({
                  modelsById: {},
                }),
              OPTIONAL_STATS_METADATA_TIMEOUT_MS,
            );
          }),
        ]),
      ])
        .then(async ([response, llmStatsMetadata]) => {
          if (!response.ok) {
            return FALLBACK_DYNAMIC_MODELS;
          }

          const data = (await response.json()) as {
            data?: OpenRouterModel[];
          };

          const models = (data.data || [])
            .filter(isSupportedTextModel)
            .map((model) => availableModelFromOpenRouterModel(model, llmStatsMetadata.modelsById));
          return models.length > 0 ? models : FALLBACK_DYNAMIC_MODELS;
        })
        .finally(() => {
          dynamicModelsPromise = null;
        });
    }

    return await dynamicModelsPromise;
  } catch (error) {
    console.error("Failed to fetch dynamic models", error);
    return FALLBACK_DYNAMIC_MODELS;
  }
}

async function fetchAndCacheDynamicModels(): Promise<AvailableModel[]> {
  const models = await fetchDynamicModels();
  if (models.length > 0) {
    await saveDynamicModelsCache(models);
  }
  return models;
}

function modelPriceRange(models: AvailableModel[]): {
  min: number | null;
  max: number | null;
} {
  const prices = models
    .map((model) => model.price)
    .filter((price): price is number => price != null && Number.isFinite(price));

  if (prices.length === 0) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function isModelWithinCostLimit(model: AvailableModel, modelCostLimit: number): boolean {
  return typeof model.price !== "number" || model.price <= modelCostLimit;
}

function resolveFallbackModelKey(preferredKey: string, models: AvailableModel[]): string {
  if (models.some((model) => model.key === preferredKey)) {
    return preferredKey;
  }

  return models[0]?.key ?? preferredKey;
}

async function getStoredModelCostLimits(): Promise<{
  summarizerModelCostLimit: number;
  refinerModelCostLimit: number;
}> {
  const result = await getStorageValues<Record<string, unknown>>([
    STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT,
    STORAGE_KEYS.REFINER_MODEL_COST_LIMIT,
  ]);

  return {
    summarizerModelCostLimit: normalizeModelCostLimit(
      result[STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT],
    ),
    refinerModelCostLimit: normalizeModelCostLimit(result[STORAGE_KEYS.REFINER_MODEL_COST_LIMIT]),
  };
}

function storagePreferences(result: UserPreferenceStorageResult): Partial<UserPreferences> {
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

function storageUpdatesFromPreferences(updates: Partial<UserPreferences>): Record<string, unknown> {
  const storageUpdates: Record<string, unknown> = {};

  if (updates.summaryModel) {
    storageUpdates[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL] = updates.summaryModel;
  }
  if (updates.targetLanguage) {
    storageUpdates[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM] = updates.targetLanguage;
  }
  if (updates.summarizerMode) {
    storageUpdates[STORAGE_KEYS.SUMMARIZER_MODE] = updates.summarizerMode;
  }
  if (updates.qualityModel) {
    storageUpdates[STORAGE_KEYS.QUALITY_MODEL] = updates.qualityModel;
  }

  return storageUpdates;
}

export function useConfig(options: UseConfigOptions = {}): UseConfigReturn {
  const shouldLoadDynamicModels = options.loadDynamicModels ?? true;
  const [config, setConfig] = useState<ConfigurationResponse | null>(null);
  const [dynamicModels, setDynamicModels] = useState<AvailableModel[]>(FALLBACK_DYNAMIC_MODELS);
  const [summarizerModelCostLimit, setSummarizerModelCostLimit] = useState<number>(
    DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT,
  );
  const [refinerModelCostLimit, setRefinerModelCostLimit] = useState<number>(
    DEFAULTS.REFINER_MODEL_COST_LIMIT,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dynamicModelsRef = useRef<AvailableModel[]>([]);

  useEffect(() => {
    dynamicModelsRef.current = dynamicModels;
  }, [dynamicModels]);

  const loadConfig = useCallback(async () => {
    try {
      if (!shouldLoadDynamicModels) {
        setConfig(DEFAULT_CONFIGURATION_RESPONSE);
        setDynamicModels(FALLBACK_DYNAMIC_MODELS);
        setError(null);
        setIsLoading(false);
        return;
      }

      const hasVisibleModels =
        dynamicModelsRef.current.length > FALLBACK_DYNAMIC_MODELS.length ||
        dynamicModelsRef.current.some((model) => model.recommended);
      if (!hasVisibleModels) {
        setIsLoading(true);
      }
      setError(null);

      const [configuration, cachedDynamicModels] = await Promise.all([
        api.getConfiguration().catch(() => null),
        loadDynamicModelsCache(),
      ]);

      setConfig(configuration ?? DEFAULT_CONFIGURATION_RESPONSE);

      if (isDynamicModelsCacheUsable(cachedDynamicModels)) {
        setDynamicModels(cachedDynamicModels.models);
        return;
      }

      const fetchedDynamicModels = await fetchAndCacheDynamicModels();
      if (fetchedDynamicModels.length > 0 || !hasVisibleModels) {
        setDynamicModels(
          fetchedDynamicModels.length > 0
            ? fetchedDynamicModels
            : (cachedDynamicModels?.models ?? []),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
    } finally {
      setIsLoading(false);
    }
  }, [shouldLoadDynamicModels]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    let isActive = true;

    void getStoredModelCostLimits().then((storedModelCostLimits) => {
      if (!isActive) return;
      setSummarizerModelCostLimit(storedModelCostLimits.summarizerModelCostLimit);
      setRefinerModelCostLimit(storedModelCostLimits.refinerModelCostLimit);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return;
      if (
        !changes[STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT] &&
        !changes[STORAGE_KEYS.REFINER_MODEL_COST_LIMIT]
      ) {
        return;
      }

      void getStoredModelCostLimits().then((storedModelCostLimits) => {
        if (!isActive) return;
        setSummarizerModelCostLimit(storedModelCostLimits.summarizerModelCostLimit);
        setRefinerModelCostLimit(storedModelCostLimits.refinerModelCostLimit);
      });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      isActive = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const enrichedModels = useMemo(() => dynamicModels, [dynamicModels]);

  const allSummarizerModels = useMemo(
    () => sortModelsByRankKey(enrichedModels, "intelligenceScore"),
    [enrichedModels],
  );
  const allRefinerModels = useMemo(
    () => sortModelsByRankKey(enrichedModels, "speedMetric"),
    [enrichedModels],
  );
  const summarizerModelPriceRange = useMemo(
    () => modelPriceRange(allSummarizerModels),
    [allSummarizerModels],
  );
  const refinerModelPriceRange = useMemo(
    () => modelPriceRange(allRefinerModels),
    [allRefinerModels],
  );
  const summarizerCostLimitedModels = useMemo(
    () => enrichedModels.filter((model) => isModelWithinCostLimit(model, summarizerModelCostLimit)),
    [enrichedModels, summarizerModelCostLimit],
  );
  const summarizerCostLimitedModelKeys = useMemo(
    () => new Set(summarizerCostLimitedModels.map((model) => model.key)),
    [summarizerCostLimitedModels],
  );
  const refinerCostLimitedModels = useMemo(
    () => enrichedModels.filter((model) => isModelWithinCostLimit(model, refinerModelCostLimit)),
    [enrichedModels, refinerModelCostLimit],
  );
  const refinerCostLimitedModelKeys = useMemo(
    () => new Set(refinerCostLimitedModels.map((model) => model.key)),
    [refinerCostLimitedModels],
  );
  const dynamicModelKeys = useMemo(
    () => new Set(dynamicModels.map((model) => model.key)),
    [dynamicModels],
  );
  const summarizerModels = useMemo(
    () =>
      allSummarizerModels.filter((model) =>
        isModelWithinCostLimit(model, summarizerModelCostLimit),
      ),
    [allSummarizerModels, summarizerModelCostLimit],
  );

  const refinerModels = useMemo(
    () => allRefinerModels.filter((model) => isModelWithinCostLimit(model, refinerModelCostLimit)),
    [allRefinerModels, refinerModelCostLimit],
  );

  const isValidSummarizerModel = useCallback(
    (model: string) => {
      if (dynamicModelKeys.has(model)) {
        return summarizerCostLimitedModelKeys.has(model);
      }
      return hasConfiguredModels(config)
        ? model in (config?.available_models ?? {})
        : model.length > 0;
    },
    [config, dynamicModelKeys, summarizerCostLimitedModelKeys],
  );

  const isValidRefinerModel = useCallback(
    (model: string) => {
      if (dynamicModelKeys.has(model)) {
        return refinerCostLimitedModelKeys.has(model);
      }
      return hasConfiguredModels(config)
        ? model in (config?.available_models ?? {})
        : model.length > 0;
    },
    [config, dynamicModelKeys, refinerCostLimitedModelKeys],
  );

  const isValidLanguage = useCallback(
    (language: string) =>
      config?.supported_languages
        ? language in config.supported_languages
        : language in SUPPORTED_LANGUAGES,
    [config],
  );

  return {
    config,
    summarizerModels,
    refinerModels,
    allSummarizerModels,
    allRefinerModels,
    summarizerModelPriceRange,
    refinerModelPriceRange,
    languages: SUPPORTED_LANGUAGES_LIST,
    isLoading,
    error,
    isValidSummarizerModel,
    isValidRefinerModel,
    isValidLanguage,
    refresh: loadConfig,
  };
}

export function useModelSelection(options: UseConfigOptions = {}) {
  const {
    summarizerModels,
    refinerModels,
    allSummarizerModels,
    allRefinerModels,
    summarizerModelPriceRange,
    refinerModelPriceRange,
    isValidSummarizerModel,
    isValidRefinerModel,
  } = useConfig(options);

  return {
    summarizerModels,
    refinerModels,
    allSummarizerModels,
    allRefinerModels,
    summarizerModelPriceRange,
    refinerModelPriceRange,
    isValidSummarizerModel,
    isValidRefinerModel,
  };
}

export function useLanguageSelection(options: UseConfigOptions = {}) {
  const { languages, isValidLanguage } = useConfig(options);

  return {
    languages,
    isValidLanguage,
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

export function useUserPreferences(options: UseConfigOptions = {}) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasLocalEditsRef = useRef(false);
  const {
    isValidSummarizerModel,
    isValidRefinerModel,
    isValidLanguage,
    summarizerModels,
    refinerModels,
  } = useConfig(options);
  const validatedDefaultPreferences = useMemo(
    () => ({
      summaryModel: resolveFallbackModelKey(
        DEFAULT_USER_PREFERENCES.summaryModel,
        summarizerModels,
      ),
      qualityModel: resolveFallbackModelKey(DEFAULT_USER_PREFERENCES.qualityModel, refinerModels),
      targetLanguage: DEFAULT_USER_PREFERENCES.targetLanguage,
      summarizerMode: DEFAULT_USER_PREFERENCES.summarizerMode,
    }),
    [refinerModels, summarizerModels],
  );

  const validatePreferences = useCallback(
    (prefs: Partial<UserPreferences>, defaults: UserPreferences) => {
      return {
        summaryModel:
          prefs.summaryModel && isValidSummarizerModel(prefs.summaryModel)
            ? prefs.summaryModel
            : defaults.summaryModel,
        qualityModel:
          prefs.qualityModel && isValidRefinerModel(prefs.qualityModel)
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
    [isValidLanguage, isValidRefinerModel, isValidSummarizerModel],
  );

  useEffect(() => {
    chrome.storage.local.get(USER_PREFERENCE_STORAGE_KEYS, (result) => {
      if (!hasLocalEditsRef.current) {
        setPreferences(
          validatePreferences(storagePreferences(result), validatedDefaultPreferences),
        );
      }
      setIsLoaded(true);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const updates = storagePreferenceUpdates(changes);
      if (Object.keys(updates).length > 0) {
        setPreferences((prev) =>
          validatePreferences({ ...prev, ...updates }, validatedDefaultPreferences),
        );
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [validatePreferences, validatedDefaultPreferences]);

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    hasLocalEditsRef.current = true;
    const newPrefs = { ...preferences, ...updates };
    setPreferences(newPrefs);

    const storageUpdates = storageUpdatesFromPreferences(updates);
    const writeEntries = Object.entries(storageUpdates);
    if (writeEntries.length === 0) return;

    void Promise.all(writeEntries.map(([key, value]) => setStorageValue(key, value))).catch(
      (error) => {
        console.error("Failed to sync user preferences:", error);
      },
    );
  };

  const resetPreferences = () => {
    setPreferences(validatedDefaultPreferences);
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
