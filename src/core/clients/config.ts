/** Resolves application settings into OpenAI-compatible connection details shared by SDK adapters. */

import type { AppConfig } from "../config.ts";
import { API_ENDPOINTS } from "../constants.ts";

export type LlmModelPrefixMode = "provider" | "none";

/** Translates the saved model ID for the endpoint without changing the user's selection. */
export function resolveLlmRequestModel(model: string, prefixMode: LlmModelPrefixMode): string {
  const trimmed = model.trim();
  if (prefixMode === "provider") return trimmed;
  const slashIndex = trimmed.indexOf("/");
  return slashIndex <= 0 || slashIndex === trimmed.length - 1
    ? trimmed
    : trimmed.slice(slashIndex + 1);
}

export type LlmClientConfig = Pick<AppConfig, "llmApiKey" | "llmBaseUrl" | "llmModelPrefixMode">;

/** Keeps the selected model's request identity and endpoint consistent across inference frameworks. */
export function resolveLlmConnection(model: string, config: LlmClientConfig) {
  if (!config.llmApiKey) throw new Error("LLM API key missing");
  return {
    model: resolveLlmRequestModel(model, config.llmModelPrefixMode),
    apiKey: config.llmApiKey,
    baseURL: config.llmBaseUrl || API_ENDPOINTS.LLM_DEFAULT_BASE_URL,
  };
}
