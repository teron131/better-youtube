# Better YouTube

Chrome MV3 extension for YouTube transcript extraction, caption refinement, grounded AI summaries, and recommendation filtering.

![UI Demo](static/ui.png)

<p align="center">
  <img src="static/ui1.png" alt="ui1" width="49.5%" />
  <img src="static/ui2.png" alt="ui2" width="49.5%" />
</p>
<p align="center">
  <img src="static/ui3.png" alt="ui3" width="49.5%" />
  <img src="static/ui4.png" alt="ui4" width="49.5%" />
</p>

## What It Does

- Extracts transcript and video metadata from the active YouTube watch tab.
- Refines subtitle segments in the background and streams partial caption updates back to the player.
- Generates video summaries with Gemini or an OpenAI-compatible provider.
- Uses an OpenAI Agents SDK video assistant for OpenAI-compatible summaries, follow-up questions, and summary edits.
- Caches transcripts, subtitles, metadata, and summaries in Chrome storage.
- Filters recommendation feeds with saved rules such as views, duration, age, keywords, and subscription preservation.

## Transcript Sources

The extension reads captions and metadata from the active YouTube tab and reuses cached transcripts when available.
Native Gemini summaries can also use the video URL directly.
Follow-up chat requires a transcript and a configured OpenAI-compatible API key.

## How It Works

```mermaid
flowchart LR
    accTitle: Extension overview
    accDescr: The side panel and YouTube content script send requests to the background worker, which coordinates video context, AI workflows, and storage.
    PAGE["YouTube page"] <--> CONTENT["Content script"]
    PANEL["Side panel"] --> BG["Background worker"]
    CONTENT <--> BG
    BG --> CONTEXT["Transcript and video metadata"]
    BG --> AGENT["Summary and Q&A agent"]
    BG --> GEMINI["Native Gemini summary"]
    BG --> CAPTIONS["Caption refinement pipeline"]
    BG <--> STORAGE["Chrome storage"]
    AGENT <--> TOOLS["Skills and summary tools"]
```

### Summaries and Q&A

The agent reads the video context, loads Markdown skills, and can inspect and edit an in-memory summary using hashline tools.
Only successful runs save summary changes; temporary tool history is discarded.

```mermaid
flowchart TD
    accTitle: Summary generation and video chat
    accDescr: Summary requests reuse matching cached results or run the selected provider; chat uses the agent with video context and recent conversation history.
    REQUEST["Summary request"] --> CACHE{"Matching saved summary?"}
    CACHE -->|Yes| DISPLAY["Display summary"]
    CACHE -->|No| ROUTE{"Selected provider"}
    ROUTE -->|OpenAI-compatible| AGENT["Agent with video context"]
    ROUTE -->|Native Gemini| GEMINI["Summarize supplied transcript or video URL"]
    GEMINI -->|Failure and LLM key available| AGENT
    GEMINI -->|Success| SAVE["Save final summary"]
    CHAT["Question or edit request"] --> CONTEXT["Transcript, current summary, recent chat"]
    CONTEXT --> AGENT
    AGENT <--> SKILLS["Load relevant Markdown skill"]
    AGENT <--> ARTIFACT["Write, read, or hashline-edit summary"]
    AGENT -->|Successful summary creation or edit| SAVE
    AGENT -->|Answer| REPLY["Reply in video chat"]
    SAVE --> DISPLAY
```

### Caption Refinement

Caption refinement runs independently of the agent and processes transcript chunks concurrently.

```mermaid
flowchart LR
    accTitle: Independent caption refinement pipeline
    accDescr: Captions are extracted or reused, saved as a raw fallback, then refined in concurrent LangChain batches with priority and final updates.
    REQUEST["Caption request"] --> SOURCE["Extract or reuse transcript"]
    SOURCE --> RAW["Save and display raw captions"]
    RAW --> REFINE["Concurrent LangChain refinement"]
    REFINE --> PARTIAL["Display priority updates"]
    REFINE --> FINAL["Save and display final captions"]
```

### Recommendation Filtering

```mermaid
flowchart TD
    accTitle: Recommendation filtering
    accDescr: On supported pages, saved rules filter recommendation cards while optionally preserving subscribed channels; DOM changes trigger rescans.
    PAGE["Supported YouTube page"] --> SCAN["Read recommendation cards"]
    SCAN --> SUB{"Preserve this subscribed channel?"}
    SUB -->|Yes| KEEP["Keep visible"]
    SUB -->|No| RULES{"Matches a hide rule?"}
    SETTINGS["Saved filter settings and subscriptions"] --> SUB
    SETTINGS --> RULES
    RULES -->|No| KEEP
    RULES -->|Yes| HIDE["Hide card and record reason"]
    CHANGES["Page content changes"] --> SCAN
```

## Development

```bash
pnpm install
pnpm run dev
pnpm run build
```

Useful extra commands:

```bash
pnpm run lint
pnpm run test:chrome-tab
```

For a layout preview, run `pnpm dev` and open `/sidepanel.html?example=1`.
Real video processing requires the installed extension and a configured API key.

## Load The Extension

1. Run `pnpm run build`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the repo's `dist/` directory.

## Build Output

`pnpm run build` produces:

- `dist/sidepanel.html` and the React side panel bundle
- `dist/background.js` for the MV3 service worker
- `dist/content.js` and `dist/assets/subtitles.css` for the YouTube page integration
