import { API_ENDPOINTS } from "@/core/constants";
import { getOpenRouterApiKey } from "@/core/runtimeConfig";
import { ChatOpenAI } from "@langchain/openai";

export async function createRefinerLLM(model: string): Promise<ChatOpenAI> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) throw new Error("OpenRouter API key missing");

  const httpReferer =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("")
      : "";
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: {
      baseURL: API_ENDPOINTS.OPENROUTER_BASE,
      defaultHeaders: {
        "HTTP-Referer": httpReferer,
        "X-Title": "Better YouTube - Refiner",
      },
    },
    temperature: 0.0,
  });
}
