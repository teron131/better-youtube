/** Shared transcript, summary, configuration, and progress contracts for extension surfaces. */

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiTranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  startTimeText: string;
}

export interface ChannelInfo {
  id: string;
  url: string;
  handle: string;
  title: string;
}

export interface TranscriptResponse {
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
  uploadDate?: string;
  viewCount?: number;
  likeCount?: number;
}

export interface ConfigurationResponse {
  status: string;
  message: string;
  available_models: Record<string, string>;
  supported_languages: Record<string, string>;
  default_summary_model: string;
  default_target_language: string;
}

// Summary Data Structures
export interface Summary {
  chapters: Chapter[];
  overview: string;
}

export interface Chapter {
  startTime?: string;
  endTime?: string;
  title: string;
  description: string;
}

// Streaming Types
export interface StreamingChunk {
  transcript_or_url?: string;
  summary?: Summary;
  iterations?: number;
  isComplete?: boolean;
  timestamp?: string;
  chunkNumber?: number;
  type?: "status" | "summary" | "complete" | "error";
  message?: string;
  processingTime?: string;
  totalChunks?: number;
}

export interface StreamingProgressState {
  step: "scraping" | "summarizing" | "summary_generation" | "complete";
  stepName: string;
  status: "pending" | "processing" | "completed" | "error";
  message: string;
  data?: {
    videoInfo?: VideoInfoResponse;
    transcript?: string;
  };
  error?: ApiError;
  processingTime?: string;
  iterations?: number;
  chunkCount?: number;
}

export interface StreamingProcessingResult {
  success: boolean;
  videoInfo?: VideoInfoResponse;
  transcript?: string;
  summary?: Summary;
  summaryText?: string;
  provider?: "gemini" | "llm";
  error?: ApiError;
  totalTime: string;
  iterations: number;
  chunksProcessed: number;
}

// Error Types
export interface ApiError {
  message: string;
  status?: number;
  details?: string;
  type?: "network" | "validation" | "server" | "processing" | "unknown";
}
