import { STORAGE_KEYS } from "./constants";
import { getStorageValue } from "./storage";

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function getKey(storageKey: string, envValue: unknown): Promise<string | null> {
  return normalizeKey(envValue) ?? normalizeKey(await getStorageValue<string>(storageKey));
}

export async function getOpenRouterApiKey(): Promise<string | null> {
  return getKey(STORAGE_KEYS.OPENROUTER_API_KEY, process.env.OPENROUTER_API_KEY);
}

export async function getScrapeCreatorsApiKey(): Promise<string | null> {
  return getKey(STORAGE_KEYS.SCRAPE_CREATORS_API_KEY, process.env.SCRAPECREATORS_API_KEY);
}

export async function getSupadataApiKey(): Promise<string | null> {
  return getKey(STORAGE_KEYS.SUPADATA_API_KEY, process.env.SUPADATA_API_KEY);
}
