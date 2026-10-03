/** Loads the sidepanel model catalog and syncs the composer's summary model and language preferences. */

import { sortModelsByRankKey } from "@ui/lib/model-sort";
import type { AvailableModel } from "@ui/services/config";
import { modelModalities, supportsTextResponse } from "@ui/services/model-modalities";
import {
  fetchModelSelectorMetadataIndex,
  type ModelSelectorMetadata,
  normalizeOpenRouterModelId,
} from "@ui/services/stats";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isBatchModelVariant,
  normalizeModelCostLimit,
  normalizeModelSelection,
} from "@/core/config";
import { DEFAULTS, STORAGE_KEYS, TARGET_LANGUAGES } from "@/core/constants";
import { getStorageValue, setStorageValue } from "@/core/storage";

const USER_PREFERENCE_STORAGE_KEYS = [
  STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL,
  STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL,
  STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM,
  STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED,
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
  ...new Set([DEFAULTS.MODEL_SUMMARIZER, DEFAULTS.MODEL_REFINER]),
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

// Keep the last catalog available when the composer remounts for a different video.
let dynamicModelsSnapshot: DynamicModelsCache | null = null;

type UserPreferenceStorageResult = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function modelPreferenceValue(value: unknown, fallback: string): string {
  return normalizeModelSelection(value) || fallback;
}

function hasPaidTokenPricing(model: OpenRouterModel): boolean {
  const inputCost = Number.parseFloat(model.pricing?.prompt || "0");
  const outputCost = Number.parseFloat(model.pricing?.completion || "0");
  return [inputCost, outputCost].some((price) => Number.isFinite(price) && price > 0);
}

function isSupportedTextModel(model: OpenRouterModel): boolean {
  return supportsTextResponse(modelModalities(model.architecture)) && hasPaidTokenPricing(model);
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
    modalities: modelModalities(model.architecture),
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
  const stored = record.modalities as { input?: unknown; output?: unknown } | undefined;
  const modalities = modelModalities({
    input_modalities: stored?.input,
    output_modalities: stored?.output,
  });
  if (!supportsTextResponse(modalities)) return null;

  return {
    key: record.key,
    label: record.label,
    provider: normalizeOptionalString(record.provider),
    recommended: typeof record.recommended === "boolean" ? record.recommended : undefined,
    intelligenceScore: normalizeOptionalNumber(record.intelligenceScore),
    speedMetric: normalizeOptionalNumber(record.speedMetric),
    price: normalizeOptionalNumber(record.price),
    modalities,
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
  const cachedValue = await getStorageValue<unknown>(STORAGE_KEYS.DYNAMIC_MODELS_CACHE).catch(
    () => null,
  );
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

  if (cache && (!dynamicModelsSnapshot || cache.fetchedAtMs > dynamicModelsSnapshot.fetchedAtMs)) {
    dynamicModelsSnapshot = cache;
  }
  return dynamicModelsSnapshot;
}

async function saveDynamicModelsCache(models: AvailableModel[]): Promise<void> {
  if (models.length === 0 || !models.some((model) => model.recommended)) {
    return;
  }

  dynamicModelsSnapshot = {
    source: DYNAMIC_MODELS_CACHE_SOURCE,
    fetchedAtMs: Date.now(),
    models,
  };
  await setStorageValue<DynamicModelsCache>(
    STORAGE_KEYS.DYNAMIC_MODELS_CACHE,
    dynamicModelsSnapshot,
  ).catch((error) => {
    console.warn("Could not persist the model catalog", error);
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

/** Shows a cached catalog immediately, then refreshes it from OpenRouter once the cache is stale. */
async function loadModelCatalog(setModels: (models: AvailableModel[]) => void): Promise<void> {
  const cachedDynamicModels = await loadDynamicModelsCache();
  if (cachedDynamicModels?.models.length) setModels(cachedDynamicModels.models);
  if (isDynamicModelsCacheUsable(cachedDynamicModels)) return;
  setModels(await fetchAndCacheDynamicModels());
}

async function fetchAndCacheDynamicModels(): Promise<AvailableModel[]> {
  const models = await fetchDynamicModels();
  if (models.some((model) => model.recommended)) {
    await saveDynamicModelsCache(models);
    return models;
  }
  return dynamicModelsSnapshot?.models.length ? dynamicModelsSnapshot.models : models;
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

/** Unpriced models stay visible because a missing price is not evidence of exceeding the limit. */
export function isModelWithinCostLimit(model: AvailableModel, modelCostLimit: number): boolean {
  return typeof model.price !== "number" || model.price <= modelCostLimit;
}

async function getStoredSummarizerModelCostLimit(): Promise<number> {
  return normalizeModelCostLimit(
    await getStorageValue<unknown>(STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT),
  );
}

function isSupportedLanguage(language: string): boolean {
  return TARGET_LANGUAGES.some((option) => option.value === language);
}

function storagePreferences(result: UserPreferenceStorageResult): Partial<UserPreferences> {
  return {
    summaryModel:
      stringValue(result[STORAGE_KEYS.SUMMARIZER_CUSTOM_MODEL]) ||
      stringValue(result[STORAGE_KEYS.SUMMARIZER_RECOMMENDED_MODEL]),
    targetLanguage:
      stringValue(result[STORAGE_KEYS.TARGET_LANGUAGE_CUSTOM]) ||
      stringValue(result[STORAGE_KEYS.TARGET_LANGUAGE_RECOMMENDED]),
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

  return storageUpdates;
}

/** Provides ranked catalogs for both selectors plus the summary models within the saved cost limit. */
export function useModelSelection() {
  const [dynamicModels, setDynamicModels] = useState<AvailableModel[]>(
    () => dynamicModelsSnapshot?.models ?? FALLBACK_DYNAMIC_MODELS,
  );
  const [summarizerModelCostLimit, setSummarizerModelCostLimit] = useState<number>(
    DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT,
  );

  useEffect(() => {
    void loadModelCatalog(setDynamicModels).catch((error) => {
      console.error("Failed to load the model catalog", error);
    });
  }, []);

  useEffect(() => {
    let isActive = true;
    const syncCostLimit = () => {
      void getStoredSummarizerModelCostLimit().then((costLimit) => {
        if (isActive) setSummarizerModelCostLimit(costLimit);
      });
    };
    syncCostLimit();

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes[STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT]) {
        syncCostLimit();
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      isActive = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const allSummarizerModels = useMemo(
    () => sortModelsByRankKey(dynamicModels, "intelligenceScore"),
    [dynamicModels],
  );
  const allRefinerModels = useMemo(
    () => sortModelsByRankKey(dynamicModels, "speedMetric"),
    [dynamicModels],
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

  return {
    summarizerModels,
    allSummarizerModels,
    allRefinerModels,
    summarizerModelPriceRange,
    refinerModelPriceRange,
  };
}

interface UserPreferences {
  summaryModel: string;
  targetLanguage: string;
}

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  summaryModel: DEFAULTS.MODEL_SUMMARIZER,
  targetLanguage: DEFAULTS.TARGET_LANGUAGE_RECOMMENDED,
};

function validatePreferences(prefs: Partial<UserPreferences>): UserPreferences {
  return {
    summaryModel: modelPreferenceValue(prefs.summaryModel, DEFAULT_USER_PREFERENCES.summaryModel),
    targetLanguage:
      prefs.targetLanguage && isSupportedLanguage(prefs.targetLanguage)
        ? prefs.targetLanguage
        : DEFAULT_USER_PREFERENCES.targetLanguage,
  };
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const hasLocalEditsRef = useRef(false);

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
  }, []);

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

  return {
    preferences,
    updatePreferences,
  };
}
