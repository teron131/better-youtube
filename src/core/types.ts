/** Shared transcript, video-info, and summary-result contracts for extension surfaces. */

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

/** In-memory transcript extraction result; persisted video details use `VideoMetadata`. */
export interface TranscriptResponse {
  transcript: ApiTranscriptSegment[];
  transcript_only_text?: string;
  title: string;
  description: string;
  thumbnail?: string;
  url?: string;
  viewCountInt?: number;
  likeCountInt?: number;
  publishDate?: string;
  channel?: ChannelInfo;
  durationFormatted?: string;
  videoId?: string;
}

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

export interface StreamingProcessingResult {
  success: boolean;
  videoInfo?: VideoInfoResponse;
  transcript?: string;
  summary?: string;
  error?: ApiError;
}

export interface ApiError {
  message: string;
  type?: "processing";
}
