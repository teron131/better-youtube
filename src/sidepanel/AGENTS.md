# Side Panel (React) — Agent Guide

## OVERVIEW

The side panel is the React UI for the MV3 extension. It reads/writes preferences from `chrome.storage`, sends `MESSAGE_ACTIONS` to the background/content scripts, and listens for runtime broadcasts (e.g. summary completion and errors).

- Extension entrypoint: `sidepanel.html` → loads `src/sidepanel/main.tsx`.
- Web demo entrypoint: `index.html` → also loads `src/sidepanel/main.tsx` and includes `sidepanel-mock.js` to stub `chrome.*` when running outside an extension.

## WHERE TO LOOK

- App bootstrap: `src/sidepanel/main.tsx`, `src/sidepanel/App.tsx` (router + providers)
- Main workflow UI: `src/sidepanel/pages/Index.tsx` + `src/sidepanel/hooks/use-video-processing.ts`
- Settings UI (keys/models/preferences): `src/sidepanel/pages/Settings.tsx`
- Long-task streaming + result matching: `src/sidepanel/services/streaming.ts` (uses `requestId`)
- UI config/constants for models/languages: `src/sidepanel/services/config.ts`
- Storage-backed “processing config”: `src/sidepanel/services/configLoaders.ts`
- shadcn/ui primitives: `src/sidepanel/components/ui/*` (treat as vendor-ish building blocks)

## CONVENTIONS

- Use `MESSAGE_ACTIONS` from `src/lib/constants.ts` as the cross-context contract.
- Prefer centralized messaging helpers (`@/lib/chromeUtils`, `src/sidepanel/services/streaming.ts`) over ad-hoc `chrome.runtime.sendMessage` calls.
- For long-running background work, always include a `requestId` and match on `{ action, videoId, requestId }` when listening for broadcasts.
- Routing: `src/sidepanel/App.tsx` uses `HashRouter` in extension/dev; avoid assuming clean URLs.
- Imports: `@ui/*` resolves to `src/sidepanel/*`; `@/*` resolves to `src/*`.

## ANTI-PATTERNS

- Don’t “fire and forget” long tasks without a `requestId`; you can easily resolve the wrong broadcast when multiple runs overlap.
- Don’t scatter `chrome.tabs.*` messaging across components; keep tab-targeted messaging in the few places that truly need it.
- Don’t treat `index.html`/browser preview as a full extension runtime: `sidepanel-mock.js` logs calls and returns empty tab lists.
- Don’t edit `src/sidepanel/components/ui/*` as if it’s app logic; keep app-specific behavior in `components/`, `pages/`, `hooks/`, or `services/`.

## GOTCHAS

- `Settings` uses `chrome.tabs.query` + `chrome.tabs.sendMessage` to push immediate UI changes (e.g. `UPDATE_CAPTION_FONT_SIZE`) to the active tab.
- `Index` also uses `chrome.tabs.sendMessage` for `TOGGLE_SUBTITLES`; expect `chrome.runtime.lastError` when the content script is not present (non-YouTube pages).
- `src/sidepanel/services/streaming.ts` listens via `chrome.runtime.onMessage`; always remove listeners and time out appropriately.
- Demo mode: `VITE_DEMO_MODE === "true"` loads example data in `src/sidepanel/pages/Index.tsx`.

## DEV NOTES

- Side panel UI talks to the extension via `chrome.runtime` (background) and `chrome.tabs` (content scripts).
- When debugging message flows, confirm the action names in `src/lib/constants.ts` and verify which context emits the broadcast you’re waiting for.
