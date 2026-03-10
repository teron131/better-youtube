# Side Panel (React) — Agent Guide

## Scope

`src/sidepanel` is the user-facing orchestration UI that captures configuration, sends processing requests, and reconciles asynchronous background broadcasts into coherent per-request state.

## What Module Is For

- `main.tsx` and `App.tsx` bootstrap routing/providers for extension and demo contexts.
- `pages/Index.tsx` drives the main generation workflow UI.
- `pages/Settings.tsx` manages model/API/preferences and pushes immediate tab updates.
- `services/streaming.ts` handles long-task request lifecycle and message listener matching by `requestId`.
- `hooks/use-video-processing.ts` orchestrates UI state transitions for processing flows.
- `services/config.ts` and `services/configLoaders.ts` define defaults and persistence-backed config loading.
- `components/ui/*` are reusable shadcn/ui-like primitives.

## High-signal locations

- `src/sidepanel/pages/Index.tsx`
- `src/sidepanel/pages/Settings.tsx`
- `src/sidepanel/services/streaming.ts`
- `src/sidepanel/hooks/use-video-processing.ts`
- `src/sidepanel/services/config.ts`
- Related contracts:
  - `src/core/constants.ts`
  - `src/core/requestId.ts`
  - `src/core/utils/chrome.ts`

## Repository Snapshot

- Files: `91` (`66 tsx`, `16 ts`, `2 css`, `1 md`, assets)
- TS/JS explicit exports: `25` (`12` exported vars)
- TS/JS import edges: `296` (`16` relative)
- Entrypoint-like files: `1`
- Top external targets: `react`, `@/core/utils/text`, `lucide-react`, `@/core/constants`
- Top local targets include route/page and UI primitive modules

## Symbol Inventory

High-signal symbols:

- Hooks/functions: `useVideoProcessing`, `useModelSelection`, `useLanguageSelection`, `useUserPreferences`
- Streaming lifecycle helpers: `emitProgress`, `cancelCurrentRun`, `settle`, `onAbort`, `listener`
- Message identifiers and constants: `PROGRESS_STEPS`, `KNOWN_PROVIDERS`, `AVAILABLE_MODELS`, `requestId`
- UI-to-content actions: `TOGGLE_SUBTITLES`, `UPDATE_CAPTION_FONT_SIZE`

## Syntax Relationships

- Request flow:
  UI action -> `services/streaming.ts` request creation -> background action dispatch with `requestId`.
- Completion flow:
  runtime listener checks `{ action, videoId, requestId }` before resolving UI state.
- Settings flow:
  persisted storage updates plus optional immediate active-tab messaging for live changes.
- Alias boundaries:
  `@ui/*` for local sidepanel modules, `@/*` for shared core imports.

## Key takeaways per location

- `Index.tsx`: central orchestration view; most user-visible behavior changes land here.
- `Settings.tsx`: model/key preference boundary plus active-tab side effects.
- `streaming.ts`: critical race-condition prevention and cancellation/timeouts.
- `use-video-processing.ts`: local reducer-like state transitions and progress/status shaping.
- `services/config*.ts`: single place for defaults and config normalization.

## Project-specific conventions and rationale

- Always use `MESSAGE_ACTIONS` constants and request-id tagging for long-running jobs.
- Keep background/content messaging in shared helpers/services instead of scattering raw `chrome.*` calls.
- Preserve compatibility with browser preview mode (`sidepanel-mock.js`) when touching startup/runtime checks.
- Treat `components/ui/*` as reusable primitives; app-specific logic belongs in pages/hooks/services/components outside `ui`.

## Verification commands

```bash
npm run build
/Users/teron/Projects/Agents-Config/.factory/hooks/formatter.sh
```
