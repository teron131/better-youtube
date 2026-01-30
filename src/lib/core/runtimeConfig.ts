import { STORAGE_KEYS } from "./constants";
import { getStorageValue } from "./storage";

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function getOpenRouterApiKey(): Promise<string | null> {
  return normalizeKey(
    await getStorageValue<string>(STORAGE_KEYS.OPENROUTER_API_KEY),
  );
}

export async function getScrapeCreatorsApiKey(): Promise<string | null> {
  return normalizeKey(
    await getStorageValue<string>(STORAGE_KEYS.SCRAPE_CREATORS_API_KEY),
  );
}

export async function getSupadataApiKey(): Promise<string | null> {
  return normalizeKey(
    await getStorageValue<string>(STORAGE_KEYS.SUPADATA_API_KEY),
  );
}
