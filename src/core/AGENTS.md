# src/core

## Scope

`src/core` is the shared contract and utility layer for handlers, content script, and side panel; changes here can affect every runtime context and persisted data compatibility.

## What Module Is For

- `constants.ts` defines cross-context contracts (`MESSAGE_ACTIONS`, `STORAGE_KEYS`, API endpoints, defaults).
- `storage.ts` centralizes persistence and quota-aware fallback behavior.
- `utils/chrome.ts` wraps message APIs with safer extension-context handling.
- `transcript/*` handles transcript fetch, parsing, cache, and provider fallback logic.
- `refiner/*` exposes subtitle refinement API for handler orchestration.
- `summarizer/*` exposes summary generation API and graph workflow internals (detailed in nested guide).
- `runtimeConfig.ts` + `config.ts` normalize environment keys and runtime model selection behavior.

## High-signal locations

- `src/core/constants.ts`
- `src/core/storage.ts`
- `src/core/utils/chrome.ts`
- `src/core/transcript/index.ts`
- `src/core/refiner/refiner.ts`
- `src/core/summarizer/index.ts`
- Nested module guide: `src/core/summarizer/AGENTS.md`

## Repository Snapshot

- Files: `34` (`32 ts`, `2 md`)
- TS/JS explicit exports: `91` (`36` exported vars)
- TS/JS import edges: `68` (`21` relative), re-export edges: `13`
- Entrypoint-like files: `3`
- Top local targets: `./schemas`, `./promptBuilder`, `./constants`, `./summarizer`, `./qualityUtils`, `./cache`
- Top external targets: `@/core/types`, `@/core/constants`, `@/core/utils/url`, `@/core/storage`, `zod`

## Symbol Inventory

Key symbols surfaced by stats and module boundaries:

- Shared contracts: `MESSAGE_ACTIONS`, `STORAGE_KEYS`, `DEFAULTS`, `API_ENDPOINTS`
- Summarizer exports: `createSummaryGraph`, `createSummaryNode`, `createQualityNode`, `createGarbageFilterMiddleware`
- Transcript provider helpers: `tryScrapeCreators`, `trySupadata`, cache maps
- Utility class: `PromptBuilder` (summarizer prompt composition)
- Runtime helpers: `prepareProcessingOptions`, `cn`, request-id utilities

## Syntax Relationships

- Import boundary:
  handlers/content/sidepanel depend on `@/core/constants`, `@/core/storage`, `@/core/utils/chrome`.
- Re-export boundary:
  `src/core/summarizer/index.ts` and `src/core/refiner/index.ts` expose stable APIs for handlers.
- Storage boundary:
  storage key conventions are reused across contexts; key naming changes require coordinated migration.
- Runtime boundary:
  modules must run in extension and demo contexts; direct `chrome.*` usage should remain wrapped/guarded.

## Key takeaways per location

- `constants.ts`: canonical contract source; highest blast radius for changes.
- `storage.ts`: persistence behavior including fallback and cleanup, not just CRUD.
- `utils/chrome.ts`: messaging wrapper that normalizes error behavior and listener setup.
- `transcript/index.ts`: external I/O edge with dedupe/caching to reduce retries and latency.
- `runtimeConfig.ts` and `llmClients.ts`: model/provider selection centralization used by handlers and summarizer.

## Project-specific conventions and rationale

- Keep action names, storage keys, and endpoint names centralized to avoid drift across extension contexts.
- Preserve non-extension fallback behavior where already implemented.
- Avoid bypassing cache/dedupe layers for transcript and summarizer pipelines.
- Because TS is not strict, maintain runtime guards and explicit null/error handling.
- Keep summarizer internals isolated under `src/core/summarizer/*`; use public exports from `index.ts` in callers.

## Verification commands

```bash
npm run build
/Users/teron/Projects/Agents-Config/.factory/hooks/formatter.sh
```
