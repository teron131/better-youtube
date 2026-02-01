/** Shared LLM client helpers. */

import { ChatOpenAI } from "@langchain/openai";
import { API_ENDPOINTS } from "./constants";
import { globalOpenRouterKey } from "./runtimeConfig";

export function createOpenRouterClient(
  model: string,
  title: string = "Better YouTube",
): ChatOpenAI {
  if (!globalOpenRouterKey) throw new Error("OpenRouter API key missing");

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
