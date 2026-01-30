# Better YouTube — Project Knowledge Base

**Generated:** 2026-01-19 15:42:18 +0800 **Commit:** bfae95a **Branch:** main

## Overview

Chrome MV3 extension for YouTube caption refinement + AI summarization. Stack: Vite + React + TypeScript + Tailwind/shadcn/ui; LangChain/LangGraph via OpenRouter.

## Structure

```
./
├── public/manifest.json        # MV3 manifest (service worker + content scripts + side panel)
├── index.html                  # Web demo entry
├── sidepanel.html              # Extension side panel entry
├── src/background/             # Service worker (routing + orchestration)
├── src/content/                # Content script (YouTube integration + subtitle overlay)
├── src/sidepanel/              # React UI (side panel + settings)
└── src/lib/                    # Shared libs (storage, constants, summarizer)
```

## Nested AGENTS.md (precedence)

The closest `AGENTS.md` to the file you are editing takes precedence.

- Background (MV3 service worker): `src/background/AGENTS.md`
- Content script (YouTube DOM + overlays): `src/content/AGENTS.md`
- Shared libs (constants/storage/messaging): `src/lib/AGENTS.md`
- LLM summarizer internals: `src/lib/summarizer/AGENTS.md`
- Side panel UI (React): `src/sidepanel/AGENTS.md`

## Where to look

| Task                               | Location                              | Notes                                                   |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| Add/rename message actions         | `src/lib/constants.ts`                | `MESSAGE_ACTIONS` is the cross-context contract.        |
| Background routing / orchestration | `src/background/index.ts`             | MV3 service worker entrypoint.                          |
| Background summary helpers         | `src/background/summaryHelpers.ts`    | Sends `SUMMARY_GENERATED` / error broadcasts.           |
| Content script lifecycle           | `src/content/index.ts`                | `ContentManager` + SPA navigation handling.             |
| Content message handling           | `src/content/messageHandler.ts`       | `chrome.runtime.onMessage` switch on `MESSAGE_ACTIONS`. |
| Subtitle overlay rendering         | `src/content/subtitleRenderer.ts`     | CSS lives in `public/assets/subtitles.css`.             |
| Side panel main page               | `src/sidepanel/pages/Index.tsx`       | Main UI orchestrator.                                   |
| Side panel settings                | `src/sidepanel/pages/Settings.tsx`    | API keys/models/preferences + `chrome.tabs` messaging.  |
| Streaming / long task handling     | `src/sidepanel/services/streaming.ts` | Uses `requestId` to match broadcasts to requests.       |
| Storage layer                      | `src/lib/storage.ts`                  | `chrome.storage.local` with `localStorage` fallback.    |
| Transcript fetching                | `src/lib/youtubeApi.ts`               | ScrapeCreators client + caching/deduplication.          |
| LLM summarization                  | `src/lib/summarizer/*`                | LangGraph/LangChain + zod schemas.                      |

## Conventions (project-specific)

- Build is split across two Vite configs:
  - `vite.config.ts`: multi-entry build for `index.html`, `sidepanel.html`, and `src/background/index.ts`.
  - `vite.content.config.ts`: builds `src/content/index.ts` as an IIFE into `dist/content.js` (`emptyOutDir: false`).
- Path aliases:
  - `@/*` → `src/*`
  - `@ui/*` → `src/sidepanel/*`
- LangGraph is shimmed for the extension/web environment:
  - `@langchain/langgraph` is aliased to `src/lib/langgraph-web-shim.ts` in both Vite configs.
- TypeScript strictness:
  - `tsconfig.json` is permissive (`strict: false`). Don’t assume TS will catch edge cases.
  - `tsconfig.node.json` is strict (Vite config typing).

## Anti-patterns (this project)

- Adding ad-hoc message action strings outside `src/lib/constants.ts`.
- Changing `MESSAGE_ACTIONS` or `STORAGE_KEYS` key strings without updating all contexts (background/content/sidepanel) and considering persisted data.
- Treating content script bundling like normal React bundling; keep content constraints isolated to `vite.content.config.ts`.

## Commands

```bash
npm run dev      # Vite dev server (side panel / web demo)
npm run build    # tsc + Vite build (UI+background) + content script build
npm run preview  # Preview built web demo
npm run lint     # ESLint (note: repo may not include an eslint config)
```

## Notes

- Build output lives in `dist/` and is loaded unpacked via `chrome://extensions`.
- `sidepanel-mock.js` exists to run the UI without `chrome.*` in a normal browser.
- `.tmp/better-youtube-caption/` is an ignored, separate git repo used as historical reference/prototyping (not part of the build).
