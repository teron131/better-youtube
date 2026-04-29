# src/core/summarizer

## Scope

`src/core/summarizer` implements schema-driven summary generation and quality refinement for transcript/video inputs, exposed to handlers as a deterministic, runtime-safe API surface.

## What Module Is For

- `summarizer.ts` runs the main graph/agent summarization workflow.
- `fastSummarizer.ts` provides fast-path behavior for reduced-latency summary generation.
- `schemas.ts` defines Zod contracts for summary, quality, and graph state payloads.
- `promptBuilder.ts` centralizes prompt composition and language constraints.
- `qualityUtils.ts` computes scoring and refinement thresholds.
- `summaryParser.ts` normalizes/parses model output into typed summary structures.
- `geminiSummarizer.ts` contains provider-specific Gemini summary path.
- `index.ts` re-exports stable public symbols.

## High-signal locations

- `src/core/summarizer/summarizer.ts`
- `src/core/summarizer/schemas.ts`
- `src/core/summarizer/promptBuilder.ts`
- `src/core/summarizer/qualityUtils.ts`
- `src/core/summarizer/summaryParser.ts`
- Related callers:
  - `src/handlers/summary.ts`
  - `src/core/llmClients.ts`
  - `src/core/constants.ts`

## Repository Snapshot

- Files: `9` (`8 ts`, `1 md`)
- TS/JS explicit exports: `17` (`8` exported vars)
- TS/JS import edges: `32` (`11` relative), re-export edges: `8`
- Entrypoint-like files: `1`
- Top local targets: `./schemas`, `./promptBuilder`, `./summarizer`, `./qualityUtils`, `./geminiSummarizer`
- Top external targets: `@/core/types`, `zod`, `@langchain/core/tools`, `@/core/transcript`, `@/core/llmClients`

## Symbol Inventory

High-signal symbols from script evidence:

- Workflow builders: `createSummaryGraph`, `createSummaryNode`, `createQualityNode`
- Tool/middleware: `createScrapeYoutubeTool`, `createGarbageFilterMiddleware`
- Prompt class: `PromptBuilder`
- Schema/state symbols: `SummarySchema`, `QualitySchema`, `GraphStateSchema`
- Quality constants: `MAX_SCORE_PER_ASPECT`, `SCORE_MAP`, `SUMMARY_CONFIG`

## Syntax Relationships

- External boundary:
  handlers invoke summarizer exports; sidepanel/content do not call internals directly.
- Schema boundary:
  `schemas.ts` contracts are shared across parser, quality checks, and generated output validation.
- Prompt boundary:
  `promptBuilder.ts` plus constants drive generation behavior independent from UI.
- Provider boundary:
  model clients/config from `src/core/llmClients.ts` + runtime config determine provider execution path.

## Key takeaways per location

- `summarizer.ts`: orchestration center and highest behavioral risk for regressions.
- `schemas.ts`: source of truth for generated structure; update first when output shape changes.
- `qualityUtils.ts`: termination/iteration policy for refinement loops.
- `promptBuilder.ts`: business-language rules and anti-hallucination guardrails.
- `summaryParser.ts`: resilience layer for converting raw model output into typed summaries.

## Project-specific conventions and rationale

- Keep summarizer logic UI-agnostic and callable from service worker context.
- Preserve schema-first behavior; avoid free-form or weakly typed returns.
- Keep output grounded in transcript input; avoid creative drift in prompts/settings.
- Use constants for endpoint/model defaults; avoid hard-coded provider strings where shared constants exist.
- Maintain compatibility with LangGraph web shim aliasing in extension build pipeline.

## Verification commands

```bash
pnpm run build
/Users/teron/Projects/Agents-Config/.factory/hooks/formatter.sh
```
