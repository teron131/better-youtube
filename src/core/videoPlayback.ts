/** Defines the tab-scoped caption playback channel and its source-checked seek acknowledgments. */

export const VIDEO_PLAYBACK_PORT = "better-youtube:video-playback";
export const VIDEO_HISTORY_CHANGE_EVENT = "better-youtube:history-change";

export type VideoPlaybackRequest =
  | { type: "subscribe"; videoId: string }
  | { type: "seek"; videoId: string; requestId: string; timeMs: number };

export type VideoPlaybackResponse =
  | { type: "position"; videoId: string; available: boolean; currentTimeMs: number | null }
  | { type: "seek-result"; videoId: string; requestId: string; ok: boolean; error?: string };

export interface VideoPlaybackState {
  currentTimeMs: number | null;
  isAvailable: boolean;
}
