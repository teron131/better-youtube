# src/lib/summarizer

## OVERVIEW
Summarization internals built on **LangChain + LangGraph** with **schema-first** structured outputs.
The workflow is primarily executed from the MV3 background worker (see `src/background/index.ts`) and must stay
**deterministic-ish** (temperature `0.0`) to avoid regressions in perceived output quality.

This module talks to OpenRouter via the `OPENROUTER` endpoint (`API_ENDPOINTS.OPENROUTER_BASE`) using LangChain’s
`ChatOpenAI` client configured with `baseURL` (do not hard-code URLs).

## WHERE TO LOOK
- `src/lib/summarizer/captionSummarizer.ts`
  - LangGraph state machine (`StateGraph`) for summarize → quality-check → refine loop.
  - Fast path “agent mode” (`fast_mode`) that skips the quality/refinement graph.
  - OpenRouter client construction (`createOpenRouterLLM`) and tool/middleware wiring.
- `src/lib/summarizer/schemas.ts`
  - Zod schemas for `SummarySchema`, `QualitySchema`, and `GraphStateSchema`.
  - This is the contract for `.withStructuredOutput(...)` and quality scoring.
- `src/lib/summarizer/promptBuilder.ts`
  - Centralized prompt text + language rules.
- `src/lib/summarizer/qualityUtils.ts`
  - Thresholds/iteration limits and quality score calculation.
- `src/lib/summarizer/index.ts`
  - Public re-exports (treat as the external API surface).

## CONVENTIONS
- **Schema-first**: update `schemas.ts` first, then adjust prompts and callers.
  - All LLM responses are expected to parse into Zod-backed structured output.
- **Prompt rules are product constraints** (do not casually relax them):
  - No hallucinations: every claim must be transcript-supported.
  - Avoid meta phrasing (e.g., “This video explains…”, “This summary explores…”).
  - Remove promos/filler (intros/outros/calls-to-action/sponsors).
- **Keep summarizer logic UI-free**: this folder should not depend on side panel React.
  - Progress updates flow via callbacks (`onProgress`) and background message broadcasts.
- Prefer using `API_ENDPOINTS.*` / `DEFAULTS.*` from `src/lib/constants.ts`.

## ANTI-PATTERNS
- Adding “helpful” creative variance:
  - raising model temperature, changing output format, or weakening transcript grounding.
- Returning ad-hoc JSON or free-form text instead of `SummarySchema` / `QualitySchema`.
- Mixing orchestration concerns into the UI layer (side panel) instead of background + `src/lib/summarizer/*`.
- Expanding the LangGraph state machine without understanding the refinement/termination logic
  (see `shouldContinue` and `SUMMARY_CONFIG.MAX_ITERATIONS`).

## GOTCHAS
- `fast_mode` uses a LangChain agent with `responseFormat: toolStrategy(SummarySchema)` and **does not** run quality checks.
- URL inputs may route through `scrap_youtube_tool` to fetch a transcript; missing Scrape Creators API key returns
  an error string (caller must handle).
- Garbage removal is best-effort middleware on tool calls; failures intentionally fall back to raw transcript.
- Language handling:
  - `target_language: "auto"` means “match transcript language (or English if unclear)”.
  - Non-`auto` targets are strict (“Write ALL output in …”).
- Bundling: `@langchain/langgraph` is aliased to `src/lib/langgraph-web-shim.ts` for web builds; avoid imports that
  bypass the shim.
