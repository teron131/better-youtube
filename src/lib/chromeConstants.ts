/**
 * Chrome Extension Constants
 * Centralized constants for Chrome-specific configurations, API endpoints, and UI settings
 */

// ================================
// API CONFIGURATION
// ================================

export const CHROME_API = {
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_CHAT_COMPLETIONS: "https://openrouter.ai/api/v1/chat/completions",
} as const;

// ================================
// UI TIMING CONFIGURATION
// ================================

export const UI_TIMING = {
  STREAM_CHUNK_THROTTLE_MS: 100,
  PROGRESS_UPDATE_INTERVAL: 500,
  API_TIMEOUT_MS: 300000, // 5 minutes
  SCRAPING_TIMEOUT_MS: 120000, // 2 minutes
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// ================================
// UI DIMENSIONS
// ================================

export const UI_DIMENSIONS = {
  SIDEBAR_WIDTH: "16rem",
  SIDEBAR_WIDTH_MOBILE: "18rem",
  SIDEBAR_WIDTH_ICON: "3rem",
  MOBILE_BREAKPOINT: 768,
} as const;

// ================================
// UI BEHAVIOR
// ================================

export const UI_BEHAVIOR = {
  SIDEBAR_COOKIE_NAME: "sidebar:state",
  SIDEBAR_COOKIE_MAX_AGE: 60 * 60 * 24 * 7, // 7 days
  SIDEBAR_KEYBOARD_SHORTCUT: "b",
  TOAST_LIMIT: 1,
  TOAST_REMOVE_DELAY: 1000000,
  MAX_LOG_ENTRIES: 100,
} as const;

// ================================
// FILE SIZE LIMITS
// ================================

export const FILE_LIMITS = {
  MAX_FILE_SIZE_MB: 100,
} as const;

// ================================
// QUALITY THRESHOLDS
// ================================

export const QUALITY_THRESHOLDS = {
  MIN_QUALITY_SCORE: 80, // Percentage threshold for acceptable quality (aligned with Python backend)
  MAX_ITERATIONS: 2,
  SCORE_MAP: { Fail: 0, Refine: 1, Pass: 2 } as const,
  MAX_SCORE_PER_ASPECT: 2,
} as const;

// ================================
// PROCESSING CONFIGURATION
// ================================

export const PROCESSING_CONFIG = {
  STEP_TO_ANCHOR: [-1, 0, 1, 2, 3, 2, 4],
  TOTAL_PROGRESS_ANCHORS: 4,
} as const;

// ================================
// COOKIE SETTINGS
// ================================

export const COOKIE_SETTINGS = {
  DEFAULT_EXPIRY_DAYS: 365,
} as const;

// ================================
// VIEW COUNT FORMATTING
// ================================

export const VIEW_COUNT = {
  MILLION: 1000000,
  THOUSAND: 1000,
} as const;

// ================================
// SUBTITLE RENDERING
// ================================

export const SUBTITLE_RENDERING = {
  CONTAINER_Z_INDEX: 9999,
  TIME_MULTIPLIER_MS: 1000, // Convert seconds to milliseconds
} as const;
