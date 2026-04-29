# Better YouTube — Project Knowledge Base

## Project Summary

Chrome MV3 extension for YouTube caption refinement plus AI summarization.
Primary stack: Vite + React + TypeScript + Tailwind/shadcn/ui, with shared AI workflows in `src/core/*`.

## Repository Snapshot

- Filesystem: `22` dirs, `167` files
- File types: `66 tsx`, `63 ts`, `7 md`
- TS/JS exports: `122`
- TS/JS import edges: `435`
- Entrypoint-like files: `6`

## Structure and entrypoints

- `public/manifest.json`
  Declares MV3 wiring (service worker, content scripts, side panel).
- `src/handlers/index.ts`
  Service worker entrypoint; routes `MESSAGE_ACTIONS` and orchestrates background tasks.
- `src/content/index.ts`
  Content script entrypoint; manages YouTube SPA lifecycle and subtitle overlay.
- `src/sidepanel/main.tsx`
  Side panel/web UI entrypoint used by both `sidepanel.html` and `index.html`.
- `src/core/*`
  Shared contracts and runtime-safe utilities consumed by all three contexts.
- Build configs:
  - `vite.config.ts` for UI + service worker.
  - `vite.content.config.ts` for content script IIFE bundle.

## Core flows and rationale

- Message contract flow:
  `src/core/constants.ts` (`MESSAGE_ACTIONS`) -> `src/handlers/index.ts` router -> content/sidepanel listeners.
- Caption flow:
  sidepanel/content request -> `src/handlers/refine.ts` -> `src/core/refiner/*` -> `SUBTITLES_GENERATED` broadcast + storage cache.
- Summary flow:
  request with `requestId` -> `src/handlers/summary.ts` -> `src/core/summarizer/*` graph -> `SUMMARY_GENERATED` or `SHOW_ERROR`.
- Transcript flow:
  `src/handlers/transcript.ts` + `src/core/transcript/index.ts` with cache/dedupe to reduce external calls.

## Always-on rules

- Closest-file precedence for module guides:
  - `src/handlers/AGENTS.md`
  - `src/content/AGENTS.md`
  - `src/core/AGENTS.md`
  - `src/core/summarizer/AGENTS.md`
  - `src/sidepanel/AGENTS.md`
- Keep `MESSAGE_ACTIONS` and `STORAGE_KEYS` centralized in `src/core/constants.ts`.
- Treat cross-context message payloads and persisted storage keys as compatibility surface.
- Keep content script constraints isolated to `vite.content.config.ts` (IIFE output `dist/content.js`).
- Preserve alias expectations:
  - `@/*` -> `src/*`
  - `@ui/*` -> `src/sidepanel/*`
- LangGraph imports must remain compatible with `src/core/langgraph-web-shim.ts` aliasing.
- TypeScript is permissive (`strict: false`), so rely on runtime guards, not compiler assumptions.

## Verification commands

```bash
pnpm run build
/Users/teron/Projects/Agents-Config/.factory/hooks/formatter.sh
```

## Notes

- Build output lives in `dist/` and is loaded unpacked via `chrome://extensions`.
- `sidepanel-mock.js` supports browser preview without real `chrome.*`.
- `.tmp/better-youtube-caption/` is an ignored separate reference repo and not part of extension build output.
