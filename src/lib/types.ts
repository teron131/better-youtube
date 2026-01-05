
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
}
