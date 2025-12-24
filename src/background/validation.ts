/**
 * Message Validation Helpers
 * Validates incoming messages and API keys
 */

import { ERROR_MESSAGES } from "@/lib/constants";

export function validateApiKeys(message: any): { valid: boolean; error?: string } {
  if (!message.scrapeCreatorsApiKey) {
    return { valid: false, error: ERROR_MESSAGES.SCRAPE_KEY_MISSING };
  }
  if (message.openRouterApiKey !== undefined && !message.openRouterApiKey) {
    return { valid: false, error: ERROR_MESSAGES.OPENROUTER_KEY_MISSING };
  }
  return { valid: true };
}

export function validateVideoId(videoId: string): { valid: boolean; error?: string } {
  if (!videoId) {
    return { valid: false, error: ERROR_MESSAGES.VIDEO_ID_REQUIRED };
  }
  return { valid: true };
}
