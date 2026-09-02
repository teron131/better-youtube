/** Centralize application configuration, backend synchronization, and dynamic model loading for the sidepanel. */

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
  fetchModelSelectorMetadataIndex,
  type ModelSelectorMetadata,
  normalizeOpenRouterModelId,
} from "@ui/services/stats";
import type { ConfigurationResponse } from "@ui/services/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isBatchModelVariant,
  normalizeModelCostLimit,
  normalizeModelSelection,
} from "@/core/config";
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
const DYNAMIC_MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DYNAMIC_MODELS_CACHE_SOURCE = "openrouter-effective-pricing" as const;

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
]
  .filter((modelKey) => !isBatchModelVariant(modelKey))
  .map((modelKey) => {
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
  source: typeof DYNAMIC_MODELS_CACHE_SOURCE;
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

function modelPreferenceValue(value: unknown, fallback: string): string {
  return normalizeModelSelection(value) || fallback;
}

function hasPaidTokenPricing(model: OpenRouterModel): boolean {
  const inputCost = Number.parseFloat(model.pricing?.prompt || "0");
  const outputCost = Number.parseFloat(model.pricing?.completion || "0");
  return [inputCost, outputCost].some((price) => Number.isFinite(price) && price > 0);
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
  return !outputsImages(model) && hasPaidTokenPricing(model);
}

function availableModelFromOpenRouterModel(
  model: OpenRouterModel,
  modelMetadataById: Record<string, ModelSelectorMetadata>,
): AvailableModel {
  const provider = model.id.split("/")[0] || "";
  const modelMetadata = modelMetadataById[normalizeOpenRouterModelId(model.id)];
  const effectivePrice = modelMetadata?.price ?? null;

  return {
    key: model.id,
    label: effectivePrice == null ? model.name : `${model.name} ($${effectivePrice.toFixed(2)})`,
    provider,
    recommended: true,
    ...modelMetadata,
    price: effectivePrice,
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
  if (record.source !== DYNAMIC_MODELS_CACHE_SOURCE) {
    return null;
  }
  if (typeof record.fetchedAtMs !== "number" || !Number.isFinite(record.fetchedAtMs)) {
    return null;
  }

  if (!Array.isArray(record.models)) {
    return null;
  }

  const models = record.models
    .map((model) => normalizeAvailableModel(model))
    .filter((model): model is AvailableModel => model !== null && !isBatchModelVariant(model.key));

  return {
    source: DYNAMIC_MODELS_CACHE_SOURCE,
    fetchedAtMs: record.fetchedAtMs,
    models,
  };
}

function isDynamicModelsCacheUsable(cache: DynamicModelsCache | null): boolean {
  return (
    cache != null &&
    cache.models.length > 0 &&
    Date.now() - cache.fetchedAtMs <= DYNAMIC_MODELS_CACHE_TTL_MS
  );
}

async function loadDynamicModelsCache(): Promise<DynamicModelsCache | null> {
  const cachedValue = await getStorageValue<unknown>(STORAGE_KEYS.DYNAMIC_MODELS_CACHE);
  const cache = normalizeDynamicModelsCache(cachedValue);
  const cachedModels =
    cachedValue && typeof cachedValue === "object"
      ? (cachedValue as Record<string, unknown>).models
      : undefined;

  if (cache && Array.isArray(cachedModels) && cache.models.length !== cachedModels.length) {
    await setStorageValue(STORAGE_KEYS.DYNAMIC_MODELS_CACHE, cache).catch((error) => {
      console.error("Failed to remove batch variants from the dynamic model cache", error);
    });
  }

  return cache;
}

async function saveDynamicModelsCache(models: AvailableModel[]): Promise<void> {
  if (models.length === 0 || !models.some((model) => model.recommended)) {
    return;
  }

  await setStorageValue<DynamicModelsCache>(STORAGE_KEYS.DYNAMIC_MODELS_CACHE, {
    source: DYNAMIC_MODELS_CACHE_SOURCE,
    fetchedAtMs: Date.now(),
    models,
  });
}

async function fetchDynamicModels(): Promise<AvailableModel[]> {
  try {
    if (!dynamicModelsPromise) {
      dynamicModelsPromise = fetch(OPENROUTER_MODELS_URL)
        .then(async (response) => {
          if (!response.ok) {
            return FALLBACK_DYNAMIC_MODELS;
          }

          const data = (await response.json()) as {
            data?: OpenRouterModel[];
          };

          const supportedModels = (data.data || []).filter(
            (model) => isSupportedTextModel(model) && !isBatchModelVariant(model.id),
          );
          const modelMetadata = await fetchModelSelectorMetadataIndex(
            supportedModels.map((model) => model.id),
          );
          const models = supportedModels.map((model) =>
            availableModelFromOpenRouterModel(model, modelMetadata.modelsById),
          );
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
  } = useConfig(options);

  return {
    summarizerModels,
    refinerModels,
    allSummarizerModels,
    allRefinerModels,
    summarizerModelPriceRange,
    refinerModelPriceRange,
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
  const hasLocalEditsRef = useRef(false);
  const { isValidLanguage } = useConfig(options);

  const validatePreferences = useCallback(
    (prefs: Partial<UserPreferences>) => {
      return {
        summaryModel: modelPreferenceValue(
          prefs.summaryModel,
          DEFAULT_USER_PREFERENCES.summaryModel,
        ),
        qualityModel: modelPreferenceValue(
          prefs.qualityModel,
          DEFAULT_USER_PREFERENCES.qualityModel,
        ),
        targetLanguage:
          prefs.targetLanguage && isValidLanguage(prefs.targetLanguage)
            ? prefs.targetLanguage
            : DEFAULT_USER_PREFERENCES.targetLanguage,
        summarizerMode:
          prefs.summarizerMode === "native" ||
          prefs.summarizerMode === "validation" ||
          prefs.summarizerMode === "fast"
            ? prefs.summarizerMode
            : DEFAULT_USER_PREFERENCES.summarizerMode,
      };
    },
    [isValidLanguage],
  );

  useEffect(() => {
    let isActive = true;

    chrome.storage.local.get(USER_PREFERENCE_STORAGE_KEYS, (result) => {
      if (!isActive) return;
      if (!hasLocalEditsRef.current) {
        setPreferences(validatePreferences(storagePreferences(result)));
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || !USER_PREFERENCE_STORAGE_KEYS.some((key) => changes[key])) {
        return;
      }

      chrome.storage.local.get(USER_PREFERENCE_STORAGE_KEYS, (result) => {
        if (!isActive) return;
        setPreferences(validatePreferences(storagePreferences(result)));
      });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      isActive = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [validatePreferences]);

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    hasLocalEditsRef.current = true;
    const normalizedUpdates: Partial<UserPreferences> = {
      ...updates,
      ...(updates.summaryModel !== undefined
        ? {
            summaryModel: modelPreferenceValue(
              updates.summaryModel,
              DEFAULT_USER_PREFERENCES.summaryModel,
            ),
          }
        : {}),
      ...(updates.qualityModel !== undefined
        ? {
            qualityModel: modelPreferenceValue(
              updates.qualityModel,
              DEFAULT_USER_PREFERENCES.qualityModel,
            ),
          }
        : {}),
    };
    setPreferences((currentPreferences) => ({ ...currentPreferences, ...normalizedUpdates }));

    const storageUpdates = storageUpdatesFromPreferences(normalizedUpdates);
    const writeEntries = Object.entries(storageUpdates);
    if (writeEntries.length === 0) return;

    void Promise.all(writeEntries.map(([key, value]) => setStorageValue(key, value))).catch(
      (error) => {
        console.error("Failed to sync user preferences:", error);
      },
    );
  }, []);

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
  };
}
