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

[Static Demo](https://teron131.github.io/better-youtube)

## What It Does

- Extracts transcript and video metadata from the active YouTube watch tab.
- Refines subtitle segments in the background and streams partial caption updates back to the player.
- Generates video summaries with Gemini or an OpenAI-compatible LLM route.
- Caches transcripts, subtitles, metadata, and summaries in extension storage to avoid repeated work.
- Filters recommendation feeds with saved rules such as views, duration, age, keywords, and subscription preservation.

## Architecture

```mermaid
flowchart LR
    accTitle: Better YouTube extension architecture
    accDescr: Shows the main extension surfaces, background workflows, shared storage, and AI providers in a clean left-to-right map.

    YT["YouTube pages"]

    subgraph SURFACES["Extension surfaces"]
        direction TB
        CS["Content script<br/>overlay, auto-gen, feed filtering"]
        SP["Side panel<br/>summary and settings"]
    end

    subgraph WORKER["Background service worker"]
        direction TB
        BG["Message router"]

        subgraph SERVICES[" "]
            direction LR
            TR["Transcript service<br/>watch-tab extraction and dedupe"]
            RF["Caption refiner<br/>raw fallback and partial updates"]
            SR["Summary service<br/>provider routing and fallback"]
        end
    end

    subgraph SHARED["Shared state"]
        direction TB
        CFG["Runtime config<br/>provider, mode, model, API keys"]
        RC["Recommendation filters<br/>rules, stats, subscriptions"]
        ST["Chrome storage<br/>settings headroom and oldest-video cleanup"]
    end

    subgraph AI["AI providers"]
        direction TB
        GM["Gemini"]
        LLM["OpenAI-compatible LLM"]
    end

    YT --> CS
    CS --> BG
    SP --> BG
    CFG --> BG
    CS --> RC
    RC --> ST
    BG --> TR
    BG --> RF
    BG --> SR
    BG --> ST
    RF --> GM
    RF --> LLM
    SR --> GM
    SR --> LLM
```

## Processing Flows

### Caption Flow

```mermaid
sequenceDiagram
    participant UI as UI
    participant CS as Watch page
    participant BG as Background worker
    participant TR as Transcript service
    participant ST as Storage
    participant AI as AI provider

    alt Auto-generate on watch page
        CS->>CS: Wait for delay and visible tab
        CS->>BG: SCRAPE_VIDEO
    else Manual caption request
        UI->>BG: FETCH_SUBTITLES
    end

    BG->>TR: Resolve transcript
    alt Cached or pending transcript
        TR-->>BG: Reuse transcript
    else Fresh watch-tab extraction
        TR->>CS: Read captions and metadata
        CS-->>TR: Transcript payload
    end
    TR-->>BG: Transcript text
    BG->>ST: Save raw subtitles
    BG-->>CS: Raw subtitle fallback
    BG->>AI: Refine transcript
    AI-->>BG: Partial and final updates
    BG->>ST: Save refined subtitles
    BG-->>CS: Final subtitle updates
    CS->>CS: Render overlay
```

### Summary Flow

```mermaid
sequenceDiagram
    participant UI as UI
    participant BG as Background worker
    participant TR as Transcript service
    participant ST as Storage
    participant AI as Gemini or LLM

    UI->>BG: GENERATE_SUMMARY
    BG->>ST: Check cached summary

    alt No matching cached summary
        BG->>TR: Resolve transcript or video URL
        TR-->>BG: Transcript text or URL
        BG->>BG: Resolve provider and mode
        BG->>AI: Run summary workflow
        AI-->>BG: Structured summary
        BG->>ST: Save summary and metadata
    end

    BG-->>UI: SUMMARY_GENERATED or SHOW_ERROR
```

## Recommendation Filtering

```mermaid
flowchart TD
    accTitle: Recommendation filtering flow
    accDescr: Shows how the content script filters recommendation cards using saved rules, subscription lookups, and rescan scheduling.

    LOAD["YouTube feed or watch page loads"] --> PAGE{"Supported page?"}
    PAGE -->|No: channel, subscriptions, or history page| SKIP["Skip filtering"]
    PAGE -->|Yes| READ["Load filter settings, filter stats, and stored subscriptions"]
    READ --> SCAN["Scan visible recommendation cards"]
    SCAN --> EXTRACT["Extract title, channel, views, age, duration, and language hints"]
    EXTRACT --> SUBS{"Preserve subscribed channels?"}
    SUBS -->|Yes and channel matches| SHOW["Keep card visible"]
    SUBS -->|No match| RULES{"Trips any active hide rule?"}
    RULES -->|No| SHOW
    RULES -->|Yes| HIDE["Hide card and record filter reason"]
    SHOW --> RESCAN["Observe DOM changes and queue rescans for new cards"]
    HIDE --> RESCAN
    SUBLOAD["Extract subscriptions from /feed/channels on demand"] --> READ
```

## Runtime Design

- `public/manifest.json` wires the MV3 service worker, content script, side panel, and permissions.
- `src/handlers/index.ts` is the background entrypoint and routes `MESSAGE_ACTIONS` requests.
- `src/content/index.ts` manages YouTube SPA navigation, subtitle rendering, and auto-generation triggers.
- `src/sidepanel/main.tsx` boots the React side panel used in both extension and demo mode.
- `src/core/*` contains shared contracts, transcript logic, refiner logic, summarizer logic, storage helpers, and runtime config.

## Key Behaviors

- Transcript fetches are cached and deduplicated before caption or summary work begins.
- Caption refinement first saves raw subtitle segments, then pushes partial refined results as they become available.
- Summary generation selects a provider and mode from runtime config, model choice, and available API keys.
- Model selection can optionally fetch score metadata from the public Model Atlas API (`https://llm-stats.vercel.app/api/llm-stats?view=core`) to guide sorting and labels. Those scores are cached locally and are not required; if the API is unavailable, the extension keeps using the normal model list without score guidance.
- Provider logos are bundled in this repo under `public/provider-logos/`; they do not depend on Model Atlas or the score API.
- Long-running work is guarded by `requestId` and per-video workload tracking so stale responses are ignored.
- Storage keys and cross-context actions are centralized in `src/core/constants.ts`.

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
