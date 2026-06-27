// Constants for Better YouTube Chrome Extension

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
	LLM_API_KEY: "llmApiKey",
	LLM_BASE_URL: "llmBaseUrl",
	LLM_MODEL_PREFIX_MODE: "llmModelPrefixMode",
	GEMINI_API_KEY: "geminiApiKey",
	SUMMARIZER_PROVIDER: "summarizerProvider",
	SUMMARIZER_MODE: "summarizerMode",
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
	QUALITY_MODEL: "qualityModel",
	SUMMARIZER_MODEL_COST_LIMIT: "summarizerModelCostLimit",
	REFINER_MODEL_COST_LIMIT: "refinerModelCostLimit",
	DYNAMIC_MODELS_CACHE: "dynamicModelsCache",
	VIEWS_FILTER_ENABLED: "viewsFilterEnabled",
	LIVE_VIEWER_FILTER_ENABLED: "liveViewerFilterEnabled",
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
	LLM: "https://api.openai.com/v1/chat/completions",
	LLM_DEFAULT_BASE_URL: "https://api.openai.com/v1",
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
	SUMMARY_SUCCESS_DISPLAY_MS: 3000,
	CAPTION_CHECK_DELAY_MS: 500,
	TRANSCRIPT_CACHE_TTL_MS: 2 * 60 * 1000, // 2 minutes
	PROCESSING_TIMEOUT_MS: 2 * 60 * 1000, // 2 minutes
	RETRY_BACKOFF_MULTIPLIER_MS: 1000, // Base unit for exponential backoff
	API_TIMEOUT_MS: 300000, // 5 minutes
	SCRAPING_TIMEOUT_MS: 120000, // 2 minutes
	STREAM_CHUNK_THROTTLE_MS: 100,
	PROGRESS_UPDATE_INTERVAL: 500,
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

// Default models - these are fallbacks when API is unavailable
// The model list is now loaded dynamically from OpenRouter API
export const DEFAULT_MODEL_SUMMARIZER = "google/gemini-3-flash";
export const DEFAULT_MODEL_REFINER =
	"google/gemini-2.5-flash-lite-preview-09-2025";

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
	MODEL_SUMMARIZER: DEFAULT_MODEL_SUMMARIZER,
	MODEL_REFINER: DEFAULT_MODEL_REFINER,
	AUTO_GENERATE: false,
	SHOW_SUBTITLES: true,
	CAPTION_FONT_SIZE: "M" as const,
	SUMMARY_FONT_SIZE: "M" as const,
	TARGET_LANGUAGE_RECOMMENDED: "auto",
	TARGET_LANGUAGE_CUSTOM: "",
	SUMMARIZER_PROVIDER: "auto" as const,
	SUMMARIZER_MODE: "validation" as const,
	SUMMARIZER_MODEL_COST_LIMIT: 5,
	REFINER_MODEL_COST_LIMIT: 5,
	VIEWS_FILTER_ENABLED: false,
	LIVE_VIEWER_FILTER_ENABLED: false,
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
	EXTRACT_SUBSCRIPTIONS: "extractSubscriptions",
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

export const ERROR_MESSAGES = {
	CONTEXT_INVALIDATED: "Extension context invalidated",
	VIDEO_ID_REQUIRED: "Video ID is required.",
	NO_VIDEO_ID: "Could not extract video ID from URL.",
	NO_TRANSCRIPT: "No transcript available for this video",
	CHROME_TAB_EXTRACTION_FAILED: "Chrome transcript extraction failed.",
	CHROME_TAB_REQUIRES_TAB:
		"Chrome transcript extraction requires an active YouTube watch tab.",
	LLM_KEY_MISSING: "LLM API key not found",
	NOT_YOUTUBE_PAGE: "Not a YouTube video page",
	SUMMARY_IN_PROGRESS:
		"Summary generation is already in progress for this video.",
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
