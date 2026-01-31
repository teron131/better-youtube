import { loadConfig } from "./config";

export async function getOpenRouterApiKey(): Promise<string | null> {
  return (await loadConfig()).openRouterApiKey;
}

export async function getGeminiApiKey(): Promise<string | null> {
  return (await loadConfig()).geminiApiKey;
}

export async function getScrapeCreatorsApiKey(): Promise<string | null> {
  return (await loadConfig()).scrapeCreatorsApiKey;
}

export async function getSupadataApiKey(): Promise<string | null> {
  return (await loadConfig()).supadataApiKey;
}
