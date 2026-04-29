# Handlers (MV3 service worker)

## Scope

`src/handlers` is the background orchestration layer that receives runtime actions, executes transcript/refine/summary workflows, and broadcasts completion/error events back to UI/content contexts.

## What Module Is For

- `src/handlers/index.ts` routes `MESSAGE_ACTIONS` to workflow handlers via `createMessageListener`.
- `src/handlers/summary.ts` coordinates summary generation, request dedupe, and result/error broadcasting.
- `src/handlers/refine.ts` coordinates subtitle refinement with request freshness guards.
- `src/handlers/transcript.ts` fetches transcripts and emits completion notifications.
- `src/handlers/workflow.ts` centralizes request-id freshness and pending workload bookkeeping helpers.

## High-signal locations

- `src/handlers/index.ts`
- `src/handlers/summary.ts`
- `src/handlers/refine.ts`
- `src/handlers/transcript.ts`
- Related contracts:
  - `src/core/constants.ts`
  - `src/core/utils/chrome.ts`
  - `public/manifest.json`
  - `vite.config.ts`

## Repository Snapshot

- Files: `6` (`5 ts`, `1 md`)
- TS/JS functions: `1` decl, `3` arrow const, `3` async arrow
- TS/JS import edges: `18` (`3` relative)
- Entrypoint-like files: `1`
- Top local targets: `./workflow`, `./summary`, `./refine`, `./transcript`
- Top external targets: `@/core/constants`, `@/core/runtimeConfig`, `@/core/utils/chrome`, `@/core/transcript`

## Symbol Inventory

Key functions and variables:

- `logSummaryConfig` (`summary.ts`)
- `runProvider`, `tryLlm`, `tryGemini`, `finalizeRequestState` (`summary.ts`)
- `sendSubtitlesToTab`, `resolveRequestId`, `pendingCaptionJobs`, `latestCaptionWorkloads` (`refine.ts`)
- `pendingSummaryJobs`, `latestSummaryWorkloads` (`summary.ts`)

## Syntax Relationships

- Inbound action path:
  `createMessageListener` -> switch on `message.action` -> handler map in `index.ts`.
- Action constants:
  all route keys are imported from `MESSAGE_ACTIONS` (`src/core/constants.ts`).
- Outbound events:
  `chrome.runtime.sendMessage` for global broadcasts, `chrome.tabs.sendMessage` for tab-scoped subtitle pushes.
- Request freshness boundary:
  `requestId` propagation + latest-request maps prevent stale writes and stale emissions.

## Key takeaways per location

- `index.ts`: canonical runtime ingress; async handlers must keep `sendResponse` contract intact (`return true` where needed).
- `summary.ts`: highest complexity; contains provider fallback, caching/storage decisions, and dedupe maps.
- `refine.ts`: mirrors summary freshness logic for caption generation and tab updates.
- `transcript.ts`: simpler fetch-and-broadcast handler, but still relies on shared action constants.
- `workflow.ts`: reusable guardrails used by multi-step handlers.

## Project-specific conventions and rationale

- Do not add action strings inline; update `MESSAGE_ACTIONS` once in `src/core/constants.ts` and route everywhere from that contract.
- Keep flows event-driven and restartable; service worker in-memory maps are wake-cycle best effort only.
- Broadcast failures are expected when listeners are absent; handlers intentionally tolerate these non-fatal runtime errors.
- Avoid heavy synchronous work before acknowledgement on long-running actions.

## Verification commands

```bash
pnpm run build
/Users/teron/Projects/Agents-Config/.factory/hooks/formatter.sh
```
