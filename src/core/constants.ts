/** Storage keys, defaults, message actions, and tuning values shared by every extension context. */

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  LLM_API_KEY: "llmApiKey",
  LLM_BASE_URL: "llmBaseUrl",
  LLM_MODEL_PREFIX_MODE: "llmModelPrefixMode",
  GEMINI_API_KEY: "geminiApiKey",
  SUMMARIZER_PROVIDER: "summarizerProvider",
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
  SUMMARIZER_MODEL_COST_LIMIT: "summarizerModelCostLimit",
  REFINER_MODEL_COST_LIMIT: "refinerModelCostLimit",
  DYNAMIC_MODELS_CACHE: "dynamicModelsCache",
  VIEWS_FILTER_ENABLED: "viewsFilterEnabled",
  LIVE_VIEWER_FILTER_ENABLED: "liveViewerFilterEnabled",
  MIX_FILTER_ENABLED: "mixFilterEnabled",
  DURATION_FILTER_ENABLED: "durationFilterEnabled",
  KEYWORD_FILTER_ENABLED: "keywordFilterEnabled",
  AGE_FILTER_ENABLED: "ageFilterEnabled",
  ENGLISH_ONLY_TITLES: "englishOnlyTitles",
  PRESERVE_SUBSCRIBED_CHANNELS: "preserveSubscribedChannels",
  MIN_VIEWS: "minViews",
  MIN_LIVE_VIEWERS: "minLiveViewers",
  MIN_DURATION: "minDuration",
  MAX_DURATION: "maxDuration",
  MAX_AGE_YEARS: "maxAgeYears",
  FILTER_KEYWORDS: "filterKeywords",
  FILTERED_VIDEOS: "filteredVideos",
  FILTERED_VIDEO_KEYS: "filteredVideoKeys",
  YOUTUBE_SUBSCRIPTIONS: "youtubeSubscriptions",
} as const;

// ============================================================================
// API Configuration
// ============================================================================

export const API_ENDPOINTS = {
  LLM_DEFAULT_BASE_URL: "https://api.openai.com/v1",
} as const;

// ============================================================================
// Timing Constants
// ============================================================================

export const TIMING = {
  AUTO_GENERATION_DELAY_MS: 2000,
  INIT_RETRY_DELAY_MS: 500,
  MAX_INIT_ATTEMPTS: 5,
  CONTENT_SCRIPT_INIT_DELAY_MS: 500,
  TRANSCRIPT_CACHE_TTL_MS: 2 * 60 * 1000, // 2 minutes
  AGENT_TIMEOUT_MS: 3 * 60 * 1000,
  PROCESSING_TIMEOUT_MS: 190_000, // Agent deadline plus message-delivery headroom.
  SCRAPING_TIMEOUT_MS: 120000, // 2 minutes
} as const;

// ============================================================================
// UI Dimensions & Behavior
// ============================================================================

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
} as const;

// ============================================================================
// Model Configuration
// ============================================================================

export const DEFAULTS = {
  // Fallback models when the OpenRouter catalog is unavailable.
  MODEL_SUMMARIZER: "google/gemini-3-flash",
  MODEL_REFINER: "google/gemini-2.5-flash-lite-preview-09-2025",
  AUTO_GENERATE: false,
  SHOW_SUBTITLES: true,
  CAPTION_FONT_SIZE: "M" as const,
  SUMMARY_FONT_SIZE: "M" as const,
  TARGET_LANGUAGE_RECOMMENDED: "auto",
  SUMMARIZER_PROVIDER: "auto" as const,
  SUMMARIZER_MODEL_COST_LIMIT: 5,
  REFINER_MODEL_COST_LIMIT: 5,
  VIEWS_FILTER_ENABLED: false,
  LIVE_VIEWER_FILTER_ENABLED: false,
  MIX_FILTER_ENABLED: false,
  DURATION_FILTER_ENABLED: false,
  KEYWORD_FILTER_ENABLED: false,
  AGE_FILTER_ENABLED: false,
  ENGLISH_ONLY_TITLES: false,
  PRESERVE_SUBSCRIBED_CHANNELS: true,
  MIN_VIEWS: 10000,
  MIN_LIVE_VIEWERS: 1000,
  MIN_DURATION: 60,
  MAX_DURATION: 3600,
  MAX_AGE_YEARS: 5,
  FILTER_KEYWORDS: ["spoiler", "clickbait", "sponsor"] as string[],
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
    VIDEO_TITLE: "h1.ytd-watch-metadata yt-formatted-string",
  },
} as const;

export const TARGET_LANGUAGES = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "Chinese" },
] as const;

export const FONT_SIZES = {
  CAPTION: {
    S: {
      base: "1.4vw",
      max: "22px",
      min: "12px",
      fullscreen: "1.7vw",
      fullscreenMax: "28px",
    },
    M: {
      base: "1.8vw",
      max: "28px",
      min: "14px",
      fullscreen: "2.2vw",
      fullscreenMax: "36px",
    },
    L: {
      base: "2.2vw",
      max: "34px",
      min: "16px",
      fullscreen: "2.7vw",
      fullscreenMax: "44px",
    },
  },
  SUMMARY: {
    S: { base: "16px", h2: "22px", h3: "19px" },
    M: { base: "18px", h2: "26px", h3: "22px" },
    L: { base: "20px", h2: "30px", h3: "24px" },
  },
} as const;

// ============================================================================
// Messaging & Elements
// ============================================================================

export const MESSAGE_ACTIONS = {
  SCRAPE_VIDEO: "scrapeVideo",
  FETCH_SUBTITLES: "fetchSubtitles",
  GENERATE_SUMMARY: "generateSummary",
  CANCEL_VIDEO_REQUEST: "cancelVideoRequest",
  SUBTITLES_GENERATED: "subtitlesGenerated",
  SUMMARY_GENERATED: "summaryGenerated",
  TOGGLE_SUBTITLES: "toggleSubtitles",
  GET_VIDEO_TITLE: "getVideoTitle",
  CURRENT_VIDEO_CHANGED: "currentVideoChanged",
  SHOW_ERROR: "showError",
  UPDATE_CAPTION_FONT_SIZE: "updateCaptionFontSize",
  EXTRACT_SUBSCRIPTIONS: "extractSubscriptions",
  FETCH_MODEL_QUALITY_SOURCES: "fetchModelQualitySources",
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
  CONCURRENCY_LIMIT: 8,
} as const;

export const SEGMENT_PARSER_CONFIG = {
  GAP_PENALTY: -0.5,
  TAIL_GUARD_SIZE: 3,
  LENGTH_TOLERANCE: 0.5,
  MAX_REFINED_LENGTH_RATIO: 2.25,
  MAX_REFINED_LENGTH_EXTRA_CHARS: 80,
} as const;

// ============================================================================
// Types
// ============================================================================

export type FontSize = "S" | "M" | "L";
