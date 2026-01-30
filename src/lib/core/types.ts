
// ============================================================================
// API Response Types
// ============================================================================

export interface ApiTranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  startTimeText: string;
}

export interface RawTranscriptSegment {
  text: string;
  startMs: string | number;
  endMs: string | number;
  startTimeText: string;
}

export interface ChannelInfo {
  id: string;
  url: string;
  handle: string;
  title: string;
}

export interface ScrapeCreatorsResponse {
  success?: boolean;
  credits_remaining?: number;
  type?: string;
  transcript: ApiTranscriptSegment[];
  transcript_only_text?: string;
  title: string;
  description: string;
  thumbnail?: string;
  url?: string;
  id?: string;
  viewCountInt?: number;
  likeCountInt?: number;
  publishDate?: string;
  channel?: ChannelInfo;
  durationFormatted?: string;
  keywords?: string[];
  videoId?: string;
  captionTracks?: any[];
  language?: string;
}

export interface SupadataResponse {
  lang: string;
  availableLangs: string[];
  content: {
    lang: string;
    text: string;
    offset: number;
    duration: number;
  }[];
}

/**
 * Type definitions for YouTube Summarizer API
 */

// Basic Video Info
export interface VideoInfoResponse {
  url: string;
  title: string | null;
  thumbnail?: string;
  author: string | null;
  duration?: string;
  upload_date?: string;
  view_count?: number;
  like_count?: number;
}

// Request Types
export interface ScrapRequest {
  url: string;
}

export interface SummarizeRequest {
  content: string;
  content_type?: 'url' | 'transcript';
  summary_model?: string;
  quality_model?: string;
  target_language?: string | null;
  fast_mode?: boolean;
}

// Response Types
export interface ScrapResponse {
  status: string;
  message: string;
  timestamp: string;
  transcript: string | null;
  processing_time: string;
  url?: string | null;
  title?: string | null;
  thumbnail?: string | null;
  author?: string | null;
  duration?: string | null;
  upload_date?: string | null;
  view_count?: number | null;
  like_count?: number | null;
}

export interface SummarizeResponse {
  status: string;
  message: string;
  timestamp: string;
  summary: SummaryData;
  quality?: QualityData;
  processing_time: string;
  iteration_count: number;
  summary_model: string;
  quality_model: string;
  target_language?: string | null;
}

export interface ConfigurationResponse {
  status: string;
  message: string;
  available_models: Record<string, string>;
  supported_languages: Record<string, string>;
  default_summary_model: string;
  default_quality_model: string;
  default_target_language: string;
}

export interface HealthCheckResponse {
  status: 'healthy';
  message: string;
  timestamp: string;
  version: string;
  environment: {
    gemini_configured: boolean;
    scrapecreators_configured: boolean;
  };
}

// Summary Data Structures
export interface SummaryData {
  title: string;
  summary: string;
  takeaways: string[];
  chapters: SummaryChapter[];
  keywords: string[];
  target_language?: string | null;
}

export interface SummaryChapter {
  header: string;
  summary: string;
  key_points: string[];
}

// Quality Assessment Structures
export interface QualityData {
  completeness: QualityRate;
  structure: QualityRate;
  no_garbage: QualityRate;
  meta_language_avoidance: QualityRate;
  useful_keywords: QualityRate;
  correct_language: QualityRate;
  total_score?: number;
  max_possible_score?: number;
  percentage_score?: number;
  is_acceptable?: boolean;
}

export interface QualityRate {
  rate: 'Fail' | 'Refine' | 'Pass';
  reason: string;
}

// Streaming Types
export interface StreamingChunk {
  transcript_or_url?: string;
  summary?: SummaryData;
  quality?: QualityData;
  iteration_count?: number;
  is_complete?: boolean;
  timestamp?: string;
  chunk_number?: number;
  type?: 'status' | 'summary' | 'quality' | 'complete' | 'error';
  message?: string;
  processing_time?: string;
  total_chunks?: number;
}

export interface StreamingProgressState {
  step: 'scraping' | 'summarizing' | 'summary_generation' | 'quality_check' | 'refinement' | 'complete';
  stepName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message: string;
  data?: {
    videoInfo?: VideoInfoResponse;
    transcript?: string;
  };
  error?: ApiError;
  processingTime?: string;
  iterationCount?: number;
  qualityScore?: number;
  chunkCount?: number;
}

export interface StreamingProcessingResult {
  success: boolean;
  videoInfo?: VideoInfoResponse;
  transcript?: string;
  summary?: SummaryData;
  quality?: QualityData;
  summaryText?: string;
  qualityScore?: number;
  error?: ApiError;
  totalTime: string;
  iterationCount: number;
  chunksProcessed: number;
}

// Error Types
export interface ApiError {
  message: string;
  status?: number;
  details?: string;
  type?: 'network' | 'validation' | 'server' | 'processing' | 'unknown';
}
