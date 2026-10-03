/** Public transcript operations; fetch callers own the watch-tab context explicitly. */

export { clearTranscriptCache, getCachedTranscript, getPendingTranscript } from "./cache.ts";
export {
  fetchTranscript,
  toSubtitleSegments,
  extractVideoInfo,
  getResponseTranscriptText,
  getTranscriptText,
} from "./service.ts";
export type { TranscriptFetchContext } from "./service.ts";
