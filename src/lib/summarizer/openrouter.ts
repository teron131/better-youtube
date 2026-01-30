import { ChatOpenAI } from "@langchain/openai";
import { API_ENDPOINTS } from "../constants";
import { getOpenRouterApiKey } from "../runtimeConfig";

export async function createSummarizerLLM(model: string): Promise<ChatOpenAI> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) throw new Error("OpenRouter API key missing");

  const httpReferer = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("") : "";
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: {
      baseURL: API_ENDPOINTS.OPENROUTER_BASE,
      defaultHeaders: {
        "HTTP-Referer": httpReferer,
        "X-Title": "Better YouTube - Summarizer",
      },
    },
    temperature: 0.0,
  });
}
