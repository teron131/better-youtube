# Content Script — Agent Guide

## Overview

- This directory is the **MV3 content script** injected into `https://*.youtube.com/*` via `public/manifest.json` → `content_scripts`.
- Build pipeline: `vite.content.config.ts` bundles `src/content/index.ts` as an **IIFE** to `dist/content.js` (manifest loads `content.js`) with `emptyOutDir: false`.
- Runtime behavior: watches YouTube **watch pages** and renders a subtitle overlay, plus triggers/coordinates auto-generation via messaging + storage.
- Overlay styling is loaded from `public/assets/subtitles.css` (listed under `content_scripts.css`).

## Where To Look

| File | Purpose |
| --- | --- |
| `src/content/index.ts` | Lifecycle entry; `ContentManager` + `MutationObserver` for YouTube SPA navigation; initializes overlay + loads cached subtitles. |
| `src/content/messageHandler.ts` | `chrome.runtime.onMessage` router; `switch (message.action)` over `MESSAGE_ACTIONS`. |
| `src/content/subtitleRenderer.ts` | DOM overlay + playback sync (`requestAnimationFrame` loop) and font-size CSS var updates. |
| `src/content/autoGeneration.ts` | Auto-gen gating (settings checks, “already triggered” set), context validity, and delay scheduling. |
| `src/content/contentHelpers.ts` | Video ID + staleness guards (`isCurrentVideo`), storage key lists, and background message helpers. |
| `public/assets/subtitles.css` | Overlay CSS (IDs: `youtube-gemini-subtitles-container`, `youtube-gemini-subtitles-text`). |

## Conventions

- Treat YouTube as a SPA: **always** gate work by video ID (`extractVideoId()` + `isCurrentVideo(videoId)`) before rendering or writing storage.
- Only do heavy work on watch pages (see `validateLoadContext()` and `ContentManager.initialize()` guard on `youtube.com/watch`).
- Messaging contract is centralized: use `MESSAGE_ACTIONS` from `src/lib/constants.ts` (no string literals).
- Guard against stale caption updates: track `currentCaptionRequestId` and ignore `SUBTITLES_GENERATED` for older `requestId`s.
- Prefer `chrome.storage.local` with `STORAGE_KEYS`/`DEFAULTS` rather than ad-hoc keys.
- Keep observers/timeouts self-cleaning when the extension context is invalidated (`isExtensionContextValid()`).

## Anti-Patterns

- Adding new message actions only in content code; update `src/lib/constants.ts` and the matching background/sidepanel handlers.
- Updating overlay DOM without ensuring the player/container exists (`findVideoElements()` + `createSubtitleElements()`).
- Writing subtitles to storage without verifying the current video/request (SPA staleness leads to “wrong video” cache writes).
- Introducing extra DOM polling loops when the code already has init retry timing (`TIMING.*`) and a URL `MutationObserver`.

## Gotchas

- `content_scripts.matches` injects on all `https://*.youtube.com/*` pages; `initialize()` intentionally no-ops outside `/watch`.
- YouTube navigation can change `window.location.href` without a reload; `ContentManager.monitorUrlChanges()` is the canonical hook.
- `subtitles.css` is included by the manifest, but the elements are created at runtime; keep IDs aligned with `ELEMENT_IDS`.
- Font size is applied via CSS variables on `document.documentElement` (`SubtitleView.applyFontSize()`), not by editing `subtitles.css` directly.
