/**
 * Configuration Hook for YouTube Summarizer
 *
 * Provides centralized access to application configuration
 * with backend synchronization and local fallback.
 */

import { useEffect, useState } from 'react';

import { api } from '@ui/services/api';
import { ConfigurationResponse } from '@ui/services/types';
import {
  AVAILABLE_MODELS,
  AVAILABLE_MODELS_LIST,
  AVAILABLE_REFINER_MODELS_LIST,
  AVAILABLE_SUMMARIZER_MODELS_LIST,
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_QUALITY_MODEL,
  DEFAULT_TARGET_LANGUAGE,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGES_LIST,
  isValidLanguage,
  isValidModel,
  type AvailableModel,
  type SupportedLanguage,
} from '@ui/services/config';
import { deleteCookie, getCookieAsJSON, setCookieAsJSON } from '@ui/lib/cookie-utils';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const configuration = await api.getConfiguration();
      setConfig(configuration);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
      setConfig({
        status: 'success',
        message: 'Using local configuration fallback',
        available_models: AVAILABLE_MODELS,
        supported_languages: SUPPORTED_LANGUAGES,
        default_analysis_model: DEFAULT_ANALYSIS_MODEL,
        default_quality_model: DEFAULT_QUALITY_MODEL,
        default_target_language: DEFAULT_TARGET_LANGUAGE,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return {
    config,
    models: AVAILABLE_MODELS_LIST,
    summarizerModels: AVAILABLE_SUMMARIZER_MODELS_LIST,
    refinerModels: AVAILABLE_REFINER_MODELS_LIST,
    languages: SUPPORTED_LANGUAGES_LIST,
    isLoading,
    error,
    getModelByKey: (key: string) => AVAILABLE_MODELS_LIST.find(m => m.key === key),
    getLanguageByKey: (key: string) => SUPPORTED_LANGUAGES_LIST.find(l => l.key === key),
    isValidModel: (model: string) => config?.available_models ? model in config.available_models : model in AVAILABLE_MODELS,
    isValidLanguage: (language: string) => config?.supported_languages ? language in config.supported_languages : language in SUPPORTED_LANGUAGES,
    refresh: loadConfig,
  };
}

export function useModelSelection() {
  const { models, summarizerModels, refinerModels, getModelByKey, isValidModel } = useConfig();
  return {
    models,
    summarizerModels,
    refinerModels,
    getModelByKey,
    isValidModel,
    defaultModel: DEFAULT_ANALYSIS_MODEL,
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
  analysisModel: string;
  qualityModel: string;
  targetLanguage: string;
  fastMode: boolean;
}

const COOKIE_NAME = 'youtube-summarizer-prefs';

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  analysisModel: DEFAULT_ANALYSIS_MODEL,
  qualityModel: DEFAULT_QUALITY_MODEL,
  targetLanguage: DEFAULT_TARGET_LANGUAGE || 'auto',
  fastMode: false,
};

function validatePreferences(
  prefs: Partial<UserPreferences>,
  defaults: UserPreferences,
): UserPreferences {
  return {
    analysisModel: prefs.analysisModel && isValidModel(prefs.analysisModel)
      ? prefs.analysisModel
      : defaults.analysisModel,
    qualityModel: prefs.qualityModel && isValidModel(prefs.qualityModel)
      ? prefs.qualityModel
      : defaults.qualityModel,
    targetLanguage: prefs.targetLanguage && isValidLanguage(prefs.targetLanguage)
      ? prefs.targetLanguage
      : defaults.targetLanguage,
    fastMode: prefs.fastMode ?? defaults.fastMode,
  };
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    const cookieData = getCookieAsJSON<UserPreferences | null>(COOKIE_NAME, null);
    return cookieData ? validatePreferences(cookieData, DEFAULT_USER_PREFERENCES) : DEFAULT_USER_PREFERENCES;
  });

  useEffect(() => {
    setPreferences(prev => validatePreferences(prev, DEFAULT_USER_PREFERENCES));
  }, []);

  useEffect(() => {
    setCookieAsJSON(COOKIE_NAME, preferences);
  }, [preferences]);

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_USER_PREFERENCES);
    deleteCookie(COOKIE_NAME);
  };

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  };
}
