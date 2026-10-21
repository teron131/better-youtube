/** Resolves application settings into OpenAI-compatible connection details shared by SDK adapters. */

import type { AppConfig } from "../config.ts";
import { API_ENDPOINTS } from "../constants.ts";

export type LlmModelPrefixMode = "provider" | "none";

/** With "none", strips the provider prefix for endpoints that expect bare IDs ("openai/gpt-5" → "gpt-5"); "provider" sends the saved ID unchanged. */
export function resolveLlmRequestModel(model: string, prefixMode: LlmModelPrefixMode): string {
  const trimmed = model.trim();
  if (prefixMode === "provider") return trimmed;
  const slashIndex = trimmed.indexOf("/");
  return slashIndex <= 0 || slashIndex === trimmed.length - 1
    ? trimmed
    : trimmed.slice(slashIndex + 1);
}

export type LlmClientConfig = Pick<AppConfig, "llmApiKey" | "llmBaseUrl" | "llmModelPrefixMode">;

/** Throws when no LLM API key is saved; an unset base URL means OpenAI's API. */
export function resolveLlmConnection(model: string, config: LlmClientConfig) {
  if (!config.llmApiKey) throw new Error("LLM API key missing");
  return {
    model: resolveLlmRequestModel(model, config.llmModelPrefixMode),
    apiKey: config.llmApiKey,
    baseURL: config.llmBaseUrl || API_ENDPOINTS.LLM_DEFAULT_BASE_URL,
  };
}
