# Better YouTube

Chrome MV3 extension for YouTube transcript extraction, caption refinement, grounded AI summaries, and recommendation filtering.

![UI Demo](static/ui.png)

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
    accDescr: Shows the Chrome extension contexts, shared workflows, storage, and model providers.

    YT["YouTube watch and feed pages"]

    subgraph EXT["Chrome extension contexts"]
        CS["Content script"]
        SP["Side panel React app"]
        BG["Background service worker"]
    end

    subgraph CORE["Shared core workflows"]
        TR["Transcript fetch, cache, and dedupe"]
        RF["Caption refiner with partial updates"]
        SR["Summary route selection"]
        RC["Recommendation rules and subscriptions"]
        ST["Chrome storage"]
        CFG["Runtime config"]
    end

    subgraph AI["AI providers"]
        GM["Gemini"]
        LLM["OpenAI-compatible LLM"]
    end

    YT --> CS
    CS --> BG
    SP --> BG
    CS --> RC
    BG --> TR
    BG --> RF
    BG --> SR
    TR <--> ST
    RF --> ST
    SR --> ST
    RC <--> ST
    CFG --> BG
    SR --> CFG
    RF --> CS
    SR --> SP
    SR --> GM
    SR --> LLM
```

## Processing Flows

```mermaid
sequenceDiagram
    autonumber
    participant UI as Side panel or content script
    participant BG as Background worker
    participant TC as Transcript cache
    participant YT as Active YouTube tab
    participant AI as Gemini or LLM
    participant ST as Chrome storage
    participant CS as Content script

    UI->>BG: Request captions or summary
    BG->>TC: Reuse cached or pending transcript work
    alt Cache miss
        TC->>YT: Extract transcript and video metadata
        YT-->>TC: Transcript payload
    end
    TC-->>BG: Transcript text and metadata

    alt Caption refinement
        BG->>ST: Save raw subtitle segments
        BG-->>CS: SUBTITLES_GENERATED (raw fallback)
        BG->>AI: Refine transcript in chunks
        AI-->>BG: Partial and final subtitle updates
        BG->>ST: Save refined subtitles
        BG-->>CS: SUBTITLES_GENERATED (partial and final)
        CS-->>CS: Render overlay on player
    else Summary generation
        BG->>BG: Resolve provider and mode
        BG->>AI: Generate grounded summary
        AI-->>BG: Structured summary result
        BG->>ST: Save summary and metadata
        BG-->>UI: SUMMARY_GENERATED
    end
```

## Recommendation Filtering

```mermaid
flowchart TD
    accTitle: Recommendation filtering flow
    accDescr: Shows how the content script filters YouTube recommendation cards using saved rules and optional subscription preservation.

    LOAD["YouTube feed or watch page loads"] --> PAGE{"Supported page?"}
    PAGE -->|No: channel or subscriptions page| SKIP["Skip filtering"]
    PAGE -->|Yes| READ["Load filter settings, stats, and subscriptions"]
    READ --> SCAN["Scan visible recommendation cards"]
    SCAN --> CHECK{"Subscribed or passes rules?"}
    CHECK -->|Yes| SHOW["Keep card visible"]
    CHECK -->|No| HIDE["Hide card and record reason"]
    SHOW --> RESCAN["Observe DOM changes and reprocess new cards"]
    HIDE --> RESCAN
    SUBS["Extract subscriptions from /feed/channels on demand"] --> READ
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
- Long-running work is guarded by `requestId` and per-video workload tracking so stale responses are ignored.
- Storage keys and cross-context actions are centralized in `src/core/constants.ts`.

## Development

```bash
npm install
npm run dev
npm run build
```

Useful extra commands:

```bash
npm run lint
npm run test:chrome-tab
```

## Load The Extension

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the repo's `dist/` directory.

## Build Output

`npm run build` produces:

- `dist/sidepanel.html` and the React side panel bundle
- `dist/background.js` for the MV3 service worker
- `dist/content.js` and `dist/assets/subtitles.css` for the YouTube page integration
