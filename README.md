# Better YouTube Chrome Extension

Chrome extension combining YouTube caption refinement and AI-powered summarization.

![UI Demo](static/ui.png)

**Static Demo**: https://teron131.github.io/better-youtube

## Workflow

```mermaid
graph TD
  P{Provider}
  G[[Gemini API]]
  OR[[OpenRouter API]]

  TAB[[Active YouTube Tab]]
  CT[[Chrome Tab Transcript Extraction]]
  C[(Transcript Cache)]

  TXT[Transcript / Metadata]
  M{Mode}
  V[LangGraph ReAct]
  F[Fast]

  R[Refiner]
  YT([YouTube Player])
  UI([Side Panel UI])

  P --> G --> UI
  P --> OR
  TAB --> CT --> C --> TXT

  TXT --> M --> V --> UI
  M --> F --> UI

  TXT --> R --> YT

  classDef api fill:#E3F2FD,stroke:#1565C0,color:#0D47A1;
  classDef ui fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20;
  classDef option fill:#FFF3E0,stroke:#EF6C00,color:#E65100;

  class G,OR,CT api;
  class UI,YT,TAB ui;
  class P,M option;
  class C option;
```

## Transcript Source

- The extension extracts caption tracks and metadata from the active YouTube watch tab using Chrome's tab/script APIs.
- Transcript fetches are cached and deduplicated in the background worker before refinement or summarization runs.

## Workflow Management

- Every long-running summary/caption request carries a `requestId` and responses are matched by `{ action, videoId, requestId }`.
- Service worker orchestration uses per-video workload keys and in-flight job maps to dedupe identical concurrent work.
- Latest workload wins per video: stale results/errors from older workloads are suppressed.
- Content script applies a stale guard for captions and ignores subtitle updates that do not match the current caption request ID.
- Summary UI listener resolves only the matching request ID and ignores broadcasts from other runs.

## Development

```bash
npm install          # Install dependencies
npm run dev          # Dev server (side panel only)
npm run build        # Build extension
```

## Build Output

`npm run build` outputs the extension package to `dist/`:

- `sidepanel.html` + React bundle
- `background.js` (service worker)
- `content.js` + `assets/subtitles.css` (content script)
