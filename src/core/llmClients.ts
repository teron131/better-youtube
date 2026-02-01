/**
 * Centralized LLM Client Factory
 * Single source of truth for creating LLM clients with consistent configuration
 */

import { ChatOpenAI } from "@langchain/openai";
import { API_ENDPOINTS } from "./constants";
import { globalOpenRouterKey } from "./runtimeConfig";

/**
 * Create OpenRouter ChatOpenAI client with standard configuration
 * @param model - Model identifier (e.g., "google/gemini-2.0-flash-exp:free")
 * @param title - Application title for HTTP headers (default: "Better YouTube")
 * @returns Configured ChatOpenAI instance
 * @throws Error if globalOpenRouterKey is not initialized
 */
export function createOpenRouterClient(
  model: string,
  title: string = "Better YouTube",
): ChatOpenAI {
  if (!globalOpenRouterKey) {
    throw new Error("OpenRouter API key missing");
  }

  const httpReferer =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("")
      : "";

  return new ChatOpenAI({
    model,
    apiKey: globalOpenRouterKey,
    configuration: {
      baseURL: API_ENDPOINTS.OPENROUTER_BASE,
      defaultHeaders: {
        "HTTP-Referer": httpReferer,
        "X-Title": title,
      },
    },
    temperature: 0.0,
  });
}
