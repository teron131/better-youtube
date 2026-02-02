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
