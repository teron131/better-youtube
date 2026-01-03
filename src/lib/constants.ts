// Constants for Better YouTube Chrome Extension

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  SCRAPE_CREATORS_API_KEY: "scrapeCreatorsApiKey",
  OPENROUTER_API_KEY: "openRouterApiKey",
  SUMMARIZER_RECOMMENDED_MODEL: "summarizerRecommendedModel",
  SUMMARIZER_CUSTOM_MODEL: "summarizerCustomModel",
  REFINER_RECOMMENDED_MODEL: "refinerRecommendedModel",
  REFINER_CUSTOM_MODEL: "refinerCustomModel",
  AUTO_GENERATE: "autoGenerate",
  SHOW_SUBTITLES: "showSubtitles",
  CAPTION_FONT_SIZE: "captionFontSize",
  ANALYSIS_FONT_SIZE: "analysisFontSize",
  TARGET_LANGUAGE_RECOMMENDED: "targetLanguageRecommended",
  TARGET_LANGUAGE_CUSTOM: "targetLanguageCustom",
  FAST_MODE: "fastMode",
  QUALITY_MODEL: "qualityModel",
} as const;

// ============================================================================
// API Configuration
// ============================================================================

export const API_ENDPOINTS = {
  SCRAPE_CREATORS: "https://api.scrapecreators.com/v1/youtube/video",
  OPENROUTER: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_BASE: "https://openrouter.ai/api/v1",
} as const;

// For backward compatibility during migration
export const CHROME_API = {
  OPENROUTER_BASE_URL: API_ENDPOINTS.OPENROUTER_BASE,
  OPENROUTER_CHAT_COMPLETIONS: API_ENDPOINTS.OPENROUTER,
} as const;

// ============================================================================
// Timing Constants
// ============================================================================

export const TIMING = {
  AUTO_GENERATION_DELAY_MS: 2000,
  INIT_RETRY_DELAY_MS: 500,
  SUBTITLE_UPDATE_INTERVAL_MS: 100,
  MAX_INIT_ATTEMPTS: 5,
  CONTENT_SCRIPT_INIT_DELAY_MS: 500,
  STATUS_MESSAGE_DISPLAY_MS: 2000,
  ANALYSIS_SUCCESS_DISPLAY_MS: 3000,
  CAPTION_CHECK_DELAY_MS: 500,
  TRANSCRIPT_CACHE_TTL_MS: 2 * 60 * 1000, // 2 minutes
  SCRAPE_API_TIMEOUT_MS: 30 * 1000, // 30 seconds
  PROCESSING_TIMEOUT_MS: 2 * 60 * 1000, // 2 minutes
  RETRY_BACKOFF_MULTIPLIER_MS: 1000, // Base unit for exponential backoff
  API_TIMEOUT_MS: 300000, // 5 minutes
  SCRAPING_TIMEOUT_MS: 120000, // 2 minutes
  STREAM_CHUNK_THROTTLE_MS: 100,
  PROGRESS_UPDATE_INTERVAL: 500,
} as const;

// For backward compatibility during migration
export const UI_TIMING = {
  STREAM_CHUNK_THROTTLE_MS: TIMING.STREAM_CHUNK_THROTTLE_MS,
  PROGRESS_UPDATE_INTERVAL: TIMING.PROGRESS_UPDATE_INTERVAL,
  API_TIMEOUT_MS: TIMING.API_TIMEOUT_MS,
  SCRAPING_TIMEOUT_MS: TIMING.SCRAPING_TIMEOUT_MS,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// ============================================================================
// UI Dimensions & Behavior
// ============================================================================

export const UI_DIMENSIONS = {
  SIDEBAR_WIDTH: "16rem",
  SIDEBAR_WIDTH_MOBILE: "18rem",
  SIDEBAR_WIDTH_ICON: "3rem",
  MOBILE_BREAKPOINT: 768,
} as const;

export const UI_BEHAVIOR = {
  SIDEBAR_COOKIE_NAME: "sidebar:state",
  SIDEBAR_COOKIE_MAX_AGE: 60 * 60 * 24 * 7, // 7 days
  SIDEBAR_KEYBOARD_SHORTCUT: "b",
  TOAST_LIMIT: 1,
  TOAST_REMOVE_DELAY: 1000000,
  MAX_LOG_ENTRIES: 100,
} as const;

// ============================================================================
// Storage & Limits
// ============================================================================

export const STORAGE = {
  QUOTA_BYTES: 10 * 1024 * 1024,
  MAX_STORAGE_BYTES: 9.9 * 1024 * 1024, // 10 MB max
  ESTIMATED_VIDEO_SIZE_BYTES: 30 * 1024,
  CLEANUP_BATCH_SIZE: 10,
} as const;

export const STORAGE_CLEANUP = {
  MIN_VIDEOS_TO_KEEP: 5,
  DEFAULT_BATCH_SIZE: 10,
} as const;

export const FILE_LIMITS = {
  MAX_FILE_SIZE_MB: 100,
} as const;

export const COOKIE_SETTINGS = {
  DEFAULT_EXPIRY_DAYS: 365,
} as const;

// ============================================================================
// Model Configuration
// ============================================================================

export const RECOMMENDED_SUMMARIZER_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
  { value: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
] as const;

export const RECOMMENDED_REFINER_MODELS = [
  { value: "google/gemini-2.5-flash-lite-preview-09-2025", label: "Gemini 2.5 Flash Lite" },
  { value: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
] as const;

export const QUALITY_THRESHOLDS = {
  MIN_QUALITY_SCORE: 80, // Percentage threshold for acceptable quality (aligned with Python backend)
  MAX_ITERATIONS: 2,
  SCORE_MAP: { Fail: 0, Refine: 1, Pass: 2 } as const,
  MAX_SCORE_PER_ASPECT: 2,
} as const;

export const PROCESSING_CONFIG = {
  STEP_TO_ANCHOR: [-1, 0, 1, 2, 3, 2, 4],
  TOTAL_PROGRESS_ANCHORS: 4,
} as const;

export const DEFAULTS = {
  MODEL_SUMMARIZER: RECOMMENDED_SUMMARIZER_MODELS[0].value,
  MODEL_REFINER: RECOMMENDED_REFINER_MODELS[0].value,
  AUTO_GENERATE: false,
  SHOW_SUBTITLES: true,
  CAPTION_FONT_SIZE: "M" as const,
  ANALYSIS_FONT_SIZE: "M" as const,
  TARGET_LANGUAGE_RECOMMENDED: "auto",
  TARGET_LANGUAGE_CUSTOM: "",
} as const;

// ============================================================================
// YouTube & Subtitles
// ============================================================================

export const YOUTUBE = {
  VIDEO_ID_LENGTH: 11,
  SELECTORS: {
    VIDEO_PLAYER: "video.html5-main-video",
    MOVIE_PLAYER: "#movie_player",
    VIDEO_CONTAINER: ".html5-video-container",
  },
} as const;

export const TARGET_LANGUAGES = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "Chinese" },
] as const;

export const FONT_SIZES = {
  CAPTION: {
    S: { base: "1.4vw", max: "22px", min: "12px", fullscreen: "1.7vw", fullscreenMax: "28px" },
    M: { base: "1.8vw", max: "28px", min: "14px", fullscreen: "2.2vw", fullscreenMax: "36px" },
    L: { base: "2.2vw", max: "34px", min: "16px", fullscreen: "2.7vw", fullscreenMax: "44px" },
  },
  ANALYSIS: {
    S: { base: "16px", h2: "22px", h3: "19px" },
    M: { base: "18px", h2: "26px", h3: "22px" },
    L: { base: "20px", h2: "30px", h3: "24px" },
  },
} as const;

export const SUBTITLE_RENDERING = {
  CONTAINER_Z_INDEX: 9999,
  TIME_MULTIPLIER_MS: 1000, // Convert seconds to milliseconds
} as const;

// ============================================================================
// Messaging & Elements
// ============================================================================

export const MESSAGE_ACTIONS = {
  SCRAPE_VIDEO: "scrapeVideo",
  SCRAPE_VIDEO_COMPLETED: "scrapeVideoCompleted",
  FETCH_SUBTITLES: "fetchSubtitles",
  GENERATE_SUBTITLES: "generateSubtitles",
  GENERATE_SUMMARY: "generateSummary",
  SUBTITLES_GENERATED: "subtitlesGenerated",
  SUMMARY_GENERATED: "summaryGenerated",
  UPDATE_POPUP_STATUS: "updatePopupStatus",
  TOGGLE_SUBTITLES: "toggleSubtitles",
  GET_VIDEO_TITLE: "getVideoTitle",
  SHOW_ERROR: "showError",
  UPDATE_CAPTION_FONT_SIZE: "updateCaptionFontSize",
} as const;

export const ELEMENT_IDS = {
  SUBTITLE_CONTAINER: "youtube-gemini-subtitles-container",
  SUBTITLE_TEXT: "youtube-gemini-subtitles-text",
} as const;

// ============================================================================
// Specialized Config
// ============================================================================

export const REFINER_CONFIG = {
  MAX_SEGMENTS_PER_CHUNK: 30,
  CHUNK_SENTINEL: "<<<__CHUNK_END__>>>",
} as const;

export const SEGMENT_PARSER_CONFIG = {
  GAP_PENALTY: -0.5,
  TAIL_GUARD_SIZE: 3,
  LENGTH_TOLERANCE: 0.5,
} as const;

export const ERROR_MESSAGES = {
  CONTEXT_INVALIDATED: "Extension context invalidated",
  VIDEO_ID_REQUIRED: "Video ID is required.",
  NO_VIDEO_ID: "Could not extract video ID from URL.",
  NO_TRANSCRIPT: "No transcript available for this video",
  SCRAPE_KEY_MISSING: "Scrape Creators API key not found. Please set it in settings.",
  OPENROUTER_KEY_MISSING: "OpenRouter API key not found",
  NOT_YOUTUBE_PAGE: "Not a YouTube video page",
  SUMMARY_IN_PROGRESS: "Summary generation is already in progress for this video.",
} as const;

export const VIEW_COUNT = {
  MILLION: 1000000,
  THOUSAND: 1000,
} as const;

// ============================================================================
// Types
// ============================================================================

export type FontSize = "S" | "M" | "L";
export type TargetLanguage = "auto" | "en" | "zh-TW" | string;
