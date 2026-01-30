# src/lib

## OVERVIEW

`src/lib` is the shared, dependency-light boundary consumed by the extension’s `background/`, `content/`, and `sidepanel/` entrypoints. Treat exported functions/constants as a compatibility surface: small signature changes can break cross-context messaging or persisted data.

This folder runs in multiple runtimes:

- Chrome extension contexts (Service Worker + content script + side panel)
- Non-extension demo/dev contexts (some modules fall back to `localStorage`)

## WHERE TO LOOK

- `src/lib/constants.ts`
  - `MESSAGE_ACTIONS`: string contract for cross-context messaging.
  - `STORAGE_KEYS`: settings keys shared across UI/background.
  - `API_ENDPOINTS`: Scrape Creators + OpenRouter endpoints.
- `src/lib/chromeUtils.ts`
  - Thin wrappers around `chrome.*` (`sendChromeMessage`, `sendTabMessage`, `createMessageListener`).
  - Context safety helper: `isChromeContextValid()`.
- `src/lib/storage.ts`
  - Persists subtitles/metadata/summaries into `chrome.storage.local`.
  - Falls back to `localStorage` when not running as an extension.
  - Handles quota pressure via cleanup + retry on `QUOTA` errors.
- `src/lib/url.ts`
  - `extractVideoId(url)`: supports `youtube.com/watch?v=…` and `youtu.be/…` (plus regex fallback).
- `src/lib/youtubeApi.ts`
  - Scrape Creators client: `fetchTranscript(videoId, apiKey, retries)`.
  - In-memory cache + dedupe: `transcriptCache`, `pendingTranscriptFetches`, TTL via `TIMING.TRANSCRIPT_CACHE_TTL_MS`.
- `src/lib/summarizer/*`
  - Summarization workflow exports are re-exported from `src/lib/summarizer/index.ts`.

## CONVENTIONS

- Prefer importing shared identifiers from `src/lib/constants.ts` instead of hard-coding strings.
  - Message routing should use `MESSAGE_ACTIONS.*`.
  - Settings persistence should use `STORAGE_KEYS.*`.
  - Network clients should use `API_ENDPOINTS.*`.
- Use `src/lib/chromeUtils.ts` wrappers rather than calling `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` directly.
  - They unify error handling via `chrome.runtime.lastError`.
- Treat `src/lib/storage.ts` as the only place that knows “where” data is stored.
  - Persisted key format is part of the API:
    - subtitles: key is the raw `videoId`
    - metadata: `video_info_${videoId}`
    - summary: `summary_${videoId}`

## ANTI-PATTERNS

- Don’t change `MESSAGE_ACTIONS` or `STORAGE_KEYS` names without updating all consumers (background/content/sidepanel) and migration strategy.
- Don’t call `chrome.*` APIs without guarding for non-extension contexts.
  - `storage.ts` intentionally supports a `localStorage` fallback; bypassing it breaks the demo/dev runtime.
- Don’t bypass caching/deduplication in `youtubeApi.ts`.
  - Re-fetching transcripts can trigger rate limits and slow UI flows.
- Don’t assume TypeScript will catch unsafe code.
  - `tsconfig.json` is **not strict** (`strict: false`, `noImplicitAny: false`), so runtime validation matters.

## GOTCHAS

- `fetchTranscript` returns `null` (not throw) for missing/invalid API key and for 401/403; callers must handle `null` explicitly.
- Transcript fetch timeouts are enforced via `AbortController` and `TIMING.SCRAPE_API_TIMEOUT_MS`.
- In `storage.ts`, quota errors are handled by deleting older video-related keys before retrying the write.
- `extractVideoId` may return IDs that aren’t validated to length 11; validate downstream if you rely on `YOUTUBE.VIDEO_ID_LENGTH`.
