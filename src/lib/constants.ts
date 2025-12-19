// Constants for Better YouTube Chrome Extension

// Storage keys
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
  SUMMARY_FONT_SIZE: "summaryFontSize",
  TARGET_LANGUAGE_RECOMMENDED: "targetLanguageRecommended",
  TARGET_LANGUAGE_CUSTOM: "targetLanguageCustom",
  FAST_MODE: "fastMode",
  QUALITY_MODEL: "qualityModel",
} as const;

// Timing constants
export const TIMING = {
  AUTO_GENERATION_DELAY_MS: 2000,
  INIT_RETRY_DELAY_MS: 500,
  SUBTITLE_UPDATE_INTERVAL_MS: 100,
  MAX_INIT_ATTEMPTS: 5,
  CONTENT_SCRIPT_INIT_DELAY_MS: 500,
  STATUS_MESSAGE_DISPLAY_MS: 2000,
  SUMMARY_SUCCESS_DISPLAY_MS: 3000,
  CAPTION_CHECK_DELAY_MS: 500,
} as const;

// Storage constants
export const STORAGE = {
  QUOTA_BYTES: 10 * 1024 * 1024,
  MAX_STORAGE_BYTES: 9.5 * 1024 * 1024,
  ESTIMATED_VIDEO_SIZE_BYTES: 30 * 1024,
  CLEANUP_BATCH_SIZE: 10,
} as const;

// Model options
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

// Target language options
export const TARGET_LANGUAGES = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "Chinese" },
] as const;

// Default values
export const DEFAULTS = {
  MODEL_SUMMARIZER: "x-ai/grok-4.1-fast",
  MODEL_REFINER: "google/gemini-2.5-flash-lite-preview-09-2025",
  AUTO_GENERATE: false,
  SHOW_SUBTITLES: true,
  CAPTION_FONT_SIZE: "M" as const,
  SUMMARY_FONT_SIZE: "M" as const,
  TARGET_LANGUAGE_RECOMMENDED: "auto",
  TARGET_LANGUAGE_CUSTOM: "",
} as const;

// Font size mappings
export const FONT_SIZES = {
  CAPTION: {
    S: { base: "1.4vw", max: "22px", min: "12px", fullscreen: "1.7vw", fullscreenMax: "28px" },
    M: { base: "1.8vw", max: "28px", min: "14px", fullscreen: "2.2vw", fullscreenMax: "36px" },
    L: { base: "2.2vw", max: "34px", min: "16px", fullscreen: "2.7vw", fullscreenMax: "44px" },
  },
  SUMMARY: {
    S: { base: "16px", h2: "22px", h3: "19px" },
    M: { base: "18px", h2: "26px", h3: "22px" },
    L: { base: "20px", h2: "30px", h3: "24px" },
  },
} as const;

// API endpoints
export const API_ENDPOINTS = {
  SCRAPE_CREATORS: "https://api.scrapecreators.com/v1/youtube/video",
  OPENROUTER: "https://openrouter.ai/api/v1/chat/completions",
} as const;

// YouTube-specific constants
export const YOUTUBE = {
  VIDEO_ID_LENGTH: 11,
  SELECTORS: {
    VIDEO_PLAYER: "video.html5-main-video",
    MOVIE_PLAYER: "#movie_player",
    VIDEO_CONTAINER: ".html5-video-container",
  },
} as const;

// Message actions
export const MESSAGE_ACTIONS = {
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

// Element IDs
export const ELEMENT_IDS = {
  SUBTITLE_CONTAINER: "youtube-gemini-subtitles-container",
  SUBTITLE_TEXT: "youtube-gemini-subtitles-text",
} as const;

export const REFINER_CONFIG = {
  MAX_SEGMENTS_PER_CHUNK: 30,
  CHUNK_SENTINEL: "<<<__CHUNK_END__>>>",
} as const;

export const SEGMENT_PARSER_CONFIG = {
  GAP_PENALTY: -0.5,
  TAIL_GUARD_SIZE: 3,
  LENGTH_TOLERANCE: 0.5,
} as const;

// Error messages
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

// Storage cleanup configuration
export const STORAGE_CLEANUP = {
  MIN_VIDEOS_TO_KEEP: 5,
  DEFAULT_BATCH_SIZE: 10,
} as const;

// Types
export type FontSize = "S" | "M" | "L";
export type TargetLanguage = "auto" | "en" | "zh-TW" | string;
