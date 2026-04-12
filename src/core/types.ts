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

export interface SupadataTranscriptItem {
	lang?: string;
	text: string;
	offset: number;
	duration: number;
}

export interface SupadataTranscriptResponse {
	lang?: string;
	availableLangs?: string[];
	content?: string | SupadataTranscriptItem[];
}

export interface SupadataJobResponse extends SupadataTranscriptResponse {
	jobId?: string;
	status?: "queued" | "active" | "completed" | "failed";
	error?: { message?: string; details?: string } | string;
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

// Request Types
export interface ScrapRequest {
	url: string;
}

export interface SummarizeRequest {
	content: string;
	contentType?: "url" | "transcript";
	summaryModel?: string;
	qualityModel?: string;
	targetLanguage?: string | null;
}

// Response Types
export interface ScrapResponse {
	status: string;
	message: string;
	timestamp: string;
	transcript: string | null;
	processingTime: string;
	url?: string | null;
	title?: string | null;
	thumbnail?: string | null;
	author?: string | null;
	duration?: string | null;
	uploadDate?: string | null;
	viewCount?: number | null;
	likeCount?: number | null;
}

export interface SummarizeResponse {
	status: string;
	message: string;
	timestamp: string;
	summary: Summary;
	quality?: QualityData;
	processingTime: string;
	iterations: number;
	summaryModel: string;
	qualityModel: string;
	targetLanguage?: string | null;
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
	status: "healthy";
	message: string;
	timestamp: string;
	version: string;
	environment: {
		gemini_configured: boolean;
		scrapecreators_configured: boolean;
	};
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

// Quality Assessment Structures
export interface QualityData {
	completeness: QualityRate;
	structure: QualityRate;
	no_garbage: QualityRate;
	meta_language_avoidance: QualityRate;
	correct_language: QualityRate;
	totalScore?: number;
	maxPossibleScore?: number;
	percentageScore?: number;
	isAcceptable?: boolean;
}

export interface QualityRate {
	rate: "Fail" | "Refine" | "Pass";
	reason: string;
}

// Streaming Types
export interface StreamingChunk {
	transcript_or_url?: string;
	summary?: Summary;
	quality?: QualityData;
	iterations?: number;
	isComplete?: boolean;
	timestamp?: string;
	chunkNumber?: number;
	type?: "status" | "summary" | "quality" | "complete" | "error";
	message?: string;
	processingTime?: string;
	totalChunks?: number;
}

export interface StreamingProgressState {
	step:
		| "scraping"
		| "summarizing"
		| "summary_generation"
		| "quality_check"
		| "refinement"
		| "complete";
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
	qualityScore?: number;
	chunkCount?: number;
}

export interface StreamingProcessingResult {
	success: boolean;
	videoInfo?: VideoInfoResponse;
	transcript?: string;
	summary?: Summary;
	quality?: QualityData;
	summaryText?: string;
	qualityScore?: number;
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
