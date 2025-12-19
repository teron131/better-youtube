/**
 * YouTube Summarizer API Service
 */

import {
  ApiError,
  ConfigurationResponse,
  HealthCheckResponse,
  ScrapRequest,
  ScrapResponse,
  SummarizeRequest,
  SummarizeResponse
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error: ApiError = {
        message: errorData.detail || `Request failed with status ${response.status}`,
        status: response.status,
        details: JSON.stringify(errorData),
        type: response.status >= 500 ? 'server' : 'validation',
      };
      throw error;
    }

    return await response.json();
  } catch (error) {
    if ((error as ApiError).status) throw error;
    throw {
      message: error instanceof Error ? error.message : 'Unknown network error',
      type: 'network',
    } as ApiError;
  }
}

export function handleApiError(error: unknown): ApiError {
  if ((error as ApiError).message && (error as ApiError).type) {
    return error as ApiError;
  }
  return {
    message: error instanceof Error ? error.message : 'Unknown error',
    type: 'unknown'
  };
}

export const api = {
  healthCheck: () => request<HealthCheckResponse>('/health'),
  getConfiguration: () => request<ConfigurationResponse>('/config'),
  scrapVideo: (data: ScrapRequest) => request<ScrapResponse>('/scrap', { method: 'POST', body: JSON.stringify(data) }),
  summarize: (data: SummarizeRequest) => request<SummarizeResponse>('/summarize', { method: 'POST', body: JSON.stringify(data) }),
  baseUrl: API_BASE_URL,
};
