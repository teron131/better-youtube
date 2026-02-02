# Better YouTube Chrome Extension

Chrome extension combining YouTube caption refinement and AI-powered summarization.

![UI Demo](static/ui.png)

**Static Demo**: https://teron131.github.io/better-youtube

**The Challenge**: YouTube's caption API has strict access limitations. While Gemini provides native YouTube access (in preview), it lacks robustness across varying video lengths and does not capture word-level caption details effectively.

## Workflow

```mermaid
graph TD
  A[YouTube Video Page] --> B{Stored Summary?}
  B -- Yes --> C[Display Stored Summary]
  B -- No --> P{Summarizer Provider}

  C --> UI[Side Panel]

  P -- Gemini --> G0[Gemini API]
  P -- OpenRouter --> OR0[OpenRouter API]

  G0 -- Fail (OR key) --> OR0
  OR0 -- Fail (Gemini key) --> G0

  subgraph Fetch[Transcript Fetch]
    T0{Transcript available?}
    T0 -- Yes --> TReady[Transcript]
    T0 -- No --> T1{Scrape Creators key?}
    T1 -- Yes --> T2[Scrape Creators API]
    T2 -- Success --> TReady
    T2 -- Fail --> T3{Supadata key?}
    T1 -- No --> T3
    T3 -- Yes --> T4[Supadata API]
    T4 -- Success --> TReady
    T3 -- No --> TEmpty[Empty transcript]
    TEmpty --> TReady
  end

  subgraph Sum[Summarization]
    OMode{OpenRouter Mode}
    OMode -- LangGraph ReAct --> OReAct[ReAct workflow]
    OMode -- Fast --> OFast[Fast summary]

    GSum[Gemini direct summary]
  end

  OR0 --> T0
  TReady --> OMode
  G0 --> GSum

  OReAct --> OUT[Save & broadcast]
  OFast --> OUT
  GSum --> OUT
  OUT --> UI
```

## Tech Stack

- **UI**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Summarizer**: LangChain + LangGraph with OpenRouter
- **Build**: Vite with multi-entry points
- **Extension**: Chrome Manifest V3

## Key Components

### Side Panel (React)

- `MainView` - Caption/Summary generation UI
- `SettingsView` - API keys, model selection, display settings

### Background Script

- Message routing between side panel and content script
- LLM API calls (OpenRouter)
- Transcript fetching (Scrape Creators API)

### Content Script

- Caption overlay on YouTube video player
- URL change detection for SPA navigation
- Font size and visibility control

## External APIs

- **Scrape Creators API** - Primary YouTube transcript fetching
- **Supadata API** - Fallback transcript fetching
- **OpenRouter** - LLM access (Grok, Gemini, etc.)

## Chrome Storage Keys

| Key                    | Type    | Description                     |
| ---------------------- | ------- | ------------------------------- |
| `scrapeCreatorsApiKey` | string  | Scrape Creators API key         |
| `openRouterApiKey`     | string  | OpenRouter API key              |
| `summarizerModel`      | string  | Model for summary               |
| `refinerModel`         | string  | Model for refinement            |
| `targetLanguage`       | string  | Target language (auto/en/zh-TW) |
| `captionFontSize`      | S/M/L   | Caption overlay font size       |
| `summaryFontSize`      | S/M/L   | Summary display font size       |
| `autoGenerate`         | boolean | Auto-generate on video load     |
| `showSubtitles`        | boolean | Show caption overlay            |

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
