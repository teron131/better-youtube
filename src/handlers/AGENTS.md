# Handlers (MV3 service worker)

## OVERVIEW

Event-driven MV3 service worker that routes `MESSAGE_ACTIONS` and orchestrates transcript refinement + summarization jobs.

## WHERE TO LOOK

- `src/handlers/index.ts`: Service worker entry; main `createMessageListener` switch on `message.action`.
- `src/handlers/summary.ts`: Summary workflow with storage/cache resolution + runtime broadcasts (helpers merged inline).
- `src/handlers/refine.ts`: Caption refinement handler.
- `src/handlers/transcript.ts`: Transcript scraping handler.
- `src/core/constants.ts`: Source of truth for `MESSAGE_ACTIONS` strings (keep action names centralized).
- `src/core/utils/chrome.ts`: Message listener wrapper (`createMessageListener`) and shared message types.
- `vite.config.ts`: Builds service worker from `src/handlers/index.ts` and outputs `dist/background.js`.
- `public/manifest.json`: Declares MV3 service worker as `background.js` (`type: "module"`).

## CONVENTIONS

- Route all runtime messages via `message.action` using `MESSAGE_ACTIONS` from `src/core/constants.ts` (no ad-hoc strings).
- Handlers that respond asynchronously must `return true` from the listener case (see `SCRAPE_VIDEO`, `FETCH_SUBTITLES`, `GENERATE_SUMMARY`).
- Use request-scoped dedupe + "latest request wins":
  - `latestCaptionRequestByVideo` / `latestSummaryRequestByVideo` gate outgoing updates via `isLatest()`.
  - `pendingCaptionJobs` / `pendingSummaryJobs` store in-flight `Promise`s keyed by `jobKey` to prevent duplicate concurrent work.
- Prefer broadcasting results with `chrome.runtime.sendMessage({ action: ... })` using `MESSAGE_ACTIONS.*_GENERATED` / `*_COMPLETED`.
- For tab-specific updates, use `chrome.tabs.sendMessage(tabId, ...)` and tolerate missing listeners (`.catch(() => {})`).

## ANTI-PATTERNS

- Assuming in-memory state survives: MV3 service workers suspend frequently; Maps like `pending*` and `latest*` are best-effort during the current wake period only.
- Starting "background loops" (e.g., `setInterval`) to keep the worker alive; design for event-driven execution.
- Adding new message actions outside `src/core/constants.ts` or bypassing the `createMessageListener` routing.
- Doing heavy synchronous CPU work in the message handler before calling `sendResponse({ status: "processing" })`.

## GOTCHAS

- MV3 service worker constraints: no DOM, no `window`, and the worker may be terminated mid-await; always make workflows restartable and persist anything that must survive (use `src/core/storage`).
- Runtime messaging failure modes:
  - `chrome.runtime.sendMessage` can fail when no listeners exist; this code intentionally ignores those errors.
  - Callback-style APIs may require checking `chrome.runtime.lastError` (see `sendRuntimeMessage` in `src/handlers/summary.ts`).
- Service worker is bundled by Vite:
  - Input: `src/handlers/index.ts`
  - Output: `dist/background.js` (forced to root via `entryFileNames` in `vite.config.ts`)
  - Manifest wiring: `public/manifest.json` → `background.service_worker: "background.js"`

## COMMANDS

- `npm run build`: Runs `tsc`, then builds the extension bundles; verify `dist/background.js` exists and matches the manifest.
