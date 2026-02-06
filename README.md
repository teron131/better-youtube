# Better YouTube Chrome Extension

Chrome extension combining YouTube caption refinement and AI-powered summarization.

![UI Demo](static/ui.png)

**Static Demo**: https://teron131.github.io/better-youtube

**The Challenge**: YouTube's caption API has strict access limitations. While Gemini provides native YouTube access (in preview), it lacks robustness across varying video lengths and does not capture word-level caption details effectively.

## Workflow

```mermaid
graph TD
  P{Provider}
  G[[Gemini API]]
  OR[[OpenRouter API]]

  T{Transcript API}
  SC[[Scrape Creators API]]
  SD[[Supadata API]]

  TXT[Transcript / Metadata]
  M{Mode}
  V[LangGraph ReAct]
  F[Fast]

  R[Refiner]
  YT([YouTube Player])
  UI([Side Panel UI])

  P --> G --> UI
  P --> OR --> T
  T --> SC --> TXT
  T --> SD --> TXT

  TXT --> M --> V --> UI
  M --> F --> UI

  TXT --> R --> YT

  classDef api fill:#E3F2FD,stroke:#1565C0,color:#0D47A1;
  classDef ui fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20;
  classDef option fill:#FFF3E0,stroke:#EF6C00,color:#E65100;

  class G,OR,SC,SD api;
  class UI,YT ui;
  class P,T,M option;
```

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

The Vite build outputs to `dist/`:

- `sidepanel.html` + React bundle
- `background.js` (service worker)
- `content.js` + `assets/subtitles.css` (content script)
