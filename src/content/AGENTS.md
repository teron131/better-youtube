# Content Script — Agent Guide

## Scope

`src/content` is the YouTube page runtime: it observes SPA navigation, renders subtitle overlay DOM, and coordinates background requests while preventing stale cross-video updates.

## What Module Is For

- `src/content/index.ts` manages lifecycle and re-initialization on URL/video changes.
- `src/content/messageHandler.ts` handles inbound runtime actions and applies subtitle/summary updates.
- `src/content/subtitleRenderer.ts` controls overlay DOM creation, playback sync loop, and font-size application.
- `src/content/autoGeneration.ts` decides if/when auto-trigger should fire per video/context.
- `src/content/videoHelpers.ts` validates watch context and resolves current video metadata.
- `src/content/storageHelpers.ts` maps video/model values to stable storage lookups.
- `src/content/contentHelpers.ts` sends action requests to the background worker.

## High-signal locations

- `src/content/index.ts`
- `src/content/messageHandler.ts`
- `src/content/subtitleRenderer.ts`
- `src/content/autoGeneration.ts`
- Related boundaries:
  - `src/core/constants.ts`
  - `src/core/storage.ts`
  - `public/assets/subtitles.css`
  - `public/manifest.json`

## Script Evidence

Codemap preflight (`module_stats.sh` on `src/content`):

- Files: `8` (`7 ts`, `1 md`)
- TS/JS classes: `3` (`ContentManager`, `SubtitleController`, `SubtitleView`)
- TS/JS import edges: `36` (`8` relative)
- Entrypoint-like files: `1`
- Top local targets: `./videoHelpers`, `./subtitleRenderer`, `./storageHelpers`, `./contentHelpers`, `./autoGeneration`
- Top external targets: `@/core/constants`, `@/core/utils/url`, `@/core/utils/chrome`, `@/core/storage`, `@/core/requestId`

## Symbol Inventory

Key symbols:

- Classes: `ContentManager`, `SubtitleController`, `SubtitleView`
- State fields around staleness: `currentCaptionRequestId`, `currentVideoId`, `autoGenTriggered`
- Trigger/runtime helpers: `executeTrigger`, `run`, `tick`
- Message boundary symbols: `requestId`, `messageVideoId`, `isCurrentRequest`

## Syntax Relationships

- Inbound runtime path:
  `chrome.runtime.onMessage` (`messageHandler.ts`) -> switch on `MESSAGE_ACTIONS`.
- Outbound request path:
  `contentHelpers.ts` -> `chrome.runtime.sendMessage` with action + `videoId` + `requestId`.
- Staleness control path:
  generated subtitles -> request-id/video-id checks -> overlay update + optional persistence.
- DOM/CSS coupling:
  renderer element IDs must stay aligned with `ELEMENT_IDS` and `public/assets/subtitles.css`.

## Key takeaways per location

- `index.ts`: SPA-safe coordinator; always re-check URL/video before long work.
- `messageHandler.ts`: freshness gate for incoming generated payloads; stale responses are intentionally ignored.
- `subtitleRenderer.ts`: owns sync loop and rendering; do not duplicate playback loops elsewhere.
- `autoGeneration.ts`: guard-heavy trigger logic to avoid duplicate background jobs.
- `videoHelpers.ts` and `storageHelpers.ts`: thin utility boundaries that keep page/runtime logic out of handlers/UI.

## Project-specific conventions and rationale

- Treat YouTube as SPA-first; URL change without reload is the default.
- Never introduce ad-hoc action names; reuse `MESSAGE_ACTIONS` constants.
- Cache/persistence writes must be video-scoped and request-scoped to avoid wrong-video bleed.
- Clean up observers/timeouts/listeners aggressively because content context can invalidate at runtime.

## Validation commands

```bash
npm run build
/Users/teron/Projects/Agents-Config/.factory/hooks/formatter.sh
```
