# Agent Run Streaming Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real streamed chat experience backed by durable run events, so chat renders incrementally through SSE and can be replayed when users switch conversations or refresh the page.

**Architecture:** Add a durable `agent_run_events` log beneath existing `agent_runs`, upgrade the chat provider path to emit live deltas, and expose those deltas through an SSE endpoint plus a run-detail replay endpoint. The chat page stops treating final run JSON as the only source of truth and instead renders from ordered events using one reducer for both history and live traffic.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, PostgreSQL, Drizzle ORM, SSE over `text/event-stream`, Node test runner via `tsx --test`

---

## File Structure

- `src/server/db/schema.ts`: add `agent_run_events` table and indexes.
- `src/server/db/schema.agent-run-events.test.ts`: schema-shape tests for the new table.
- `drizzle/*`: generated migration for `agent_run_events`.
- `src/server/agent/types.ts`: extend server DTOs/types for run events and streaming shapes.
- `src/server/repositories/agent-runs.ts`: add append/list event methods and run detail loader.
- `src/server/repositories/agent-runs.test.ts`: repository/pure helper tests for event append ordering and DTO mapping.
- `src/server/ai/provider-adapters.ts`: add streaming chat adapter contract and provider implementation path.
- `src/server/ai/provider-adapters.test.ts`: provider adapter streaming contract tests where practical.
- `src/server/agent/chat-stream.ts`: new streaming bridge for batching deltas and forwarding durable event writes.
- `src/server/agent/chat-stream.test.ts`: reducer/stream batching tests.
- `src/server/agent/run-service.ts`: create-run returns early, orchestration writes events and final state.
- `src/server/agent/run-service.test.ts`: service tests for streamed success/failure and billing event behavior.
- `src/app/api/agent/runs/route.ts`: return early run payload for POST, preserve GET list.
- `src/app/api/agent/runs/[runId]/route.ts`: new run-detail endpoint.
- `src/app/api/agent/runs/[runId]/events/route.ts`: new SSE endpoint.
- `src/app/api/agent/runs/[runId]/route.test.ts`: endpoint tests.
- `src/app/api/agent/runs/[runId]/events/route.test.ts`: SSE endpoint tests.
- `src/features/public/agent-runtime-client.ts`: client helpers for create run, load run details, and stream events.
- `src/features/public/agent-runtime-client.test.ts`: client parsing and SSE helper tests.
- `src/app/chat/page.tsx`: event-reducer-based rendering, session switching, live stream subscription.

### Task 1: Add durable run-event schema

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/db/schema.agent-run-events.test.ts`
- Modify: `drizzle/`

- [ ] **Step 1: Write the failing schema-shape test**

Create `src/server/db/schema.agent-run-events.test.ts` asserting:
- exported table name is `agent_run_events`
- columns include `run_id`, `sequence`, `event_type`, `payload`
- unique index exists for `(run_id, sequence)`

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `pnpm exec tsx --test src/server/db/schema.agent-run-events.test.ts`
Expected: FAIL because `agent_run_events` is not yet defined.

- [ ] **Step 3: Add the new schema table**

Update `src/server/db/schema.ts` to add `agentRunEvents` with:
- `id`
- `runId`
- `sequence`
- `eventType`
- `payload`
- `createdAt`

And add:
- FK to `agentRuns.id` with `onDelete: 'cascade'`
- unique index on `(runId, sequence)`
- index on `(runId, createdAt)`

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm exec tsx --test src/server/db/schema.agent-run-events.test.ts`
Expected: PASS

- [ ] **Step 5: Generate migration**

Run: `pnpm db:generate`
Expected: new migration for `agent_run_events`

### Task 2: Define run-event server types and replay contract

**Files:**
- Modify: `src/server/agent/types.ts`
- Create or Modify: tests for these exported types if the file already has type-guard tests nearby

- [ ] **Step 1: Add shared event types**

Define types for:
- `AgentRunEventType`
- `AgentRunEventDto`
- chat event payload shapes for `assistant_message_started`, `assistant_delta`, `assistant_message_completed`, `run_completed`, `run_failed`, `billing_recorded`

- [ ] **Step 2: Add DTO shapes for run detail response**

Define a `AgentRunDetailDto` or equivalent type that includes:
- `run`
- `events`

- [ ] **Step 3: Run focused type/lint verification**

Run: `pnpm exec eslint src/server/agent/types.ts`
Expected: PASS

### Task 3: Extend agent-run repository for event append and replay

**Files:**
- Modify: `src/server/repositories/agent-runs.ts`
- Modify: `src/server/repositories/agent-runs.test.ts`

- [ ] **Step 1: Add failing tests for event append ordering**

Add focused tests for helper behavior such as:
- next event sequence increments monotonically
- run detail loader returns events ordered by sequence

- [ ] **Step 2: Run the repository tests to verify failure**

Run: `pnpm exec tsx --test src/server/repositories/agent-runs.test.ts`
Expected: FAIL on missing event helpers.

- [ ] **Step 3: Implement repository methods**

Add:
- `appendRunEvent(runId, event)`
- `appendRunEvents(runId, events)`
- `listRunEvents(runId)`
- `getRunDetailForUser(runId, userId)`

Keep persistence details here; no route logic.

- [ ] **Step 4: Run repository tests**

Run: `pnpm exec tsx --test src/server/repositories/agent-runs.test.ts`
Expected: PASS

### Task 4: Add streaming provider contract for chat

**Files:**
- Modify: `src/server/ai/provider-adapters.ts`
- Modify: `src/server/ai/provider-adapters.test.ts`

- [ ] **Step 1: Add failing adapter tests for stream contract**

Cover:
- adapter emits ordered deltas
- adapter reports final usage summary

- [ ] **Step 2: Run adapter tests to verify failure**

Run: `pnpm exec tsx --test src/server/ai/provider-adapters.test.ts`
Expected: FAIL on missing streaming contract.

- [ ] **Step 3: Implement `streamChat(...)` contract**

Expose a streaming API that yields text deltas plus a final terminal summary. Preserve existing non-stream contract if other callers still depend on it.

- [ ] **Step 4: Run adapter tests**

Run: `pnpm exec tsx --test src/server/ai/provider-adapters.test.ts`
Expected: PASS

### Task 5: Build the chat streaming bridge

**Files:**
- Create: `src/server/agent/chat-stream.ts`
- Create: `src/server/agent/chat-stream.test.ts`

- [ ] **Step 1: Write failing batching/replay tests**

Cover:
- deltas are aggregated into persisted chunks
- first assistant event ordering is correct
- terminal completion emits final events after all deltas

- [ ] **Step 2: Run the new tests to verify failure**

Run: `pnpm exec tsx --test src/server/agent/chat-stream.test.ts`
Expected: FAIL because file does not exist yet.

- [ ] **Step 3: Implement streaming bridge**

Create helpers that:
- accept provider deltas
- fan out live events to an in-memory stream consumer
- persist aggregated `assistant_delta` events
- finalize completion/failure events

- [ ] **Step 4: Run bridge tests**

Run: `pnpm exec tsx --test src/server/agent/chat-stream.test.ts`
Expected: PASS

### Task 6: Upgrade run service for early-return chat streaming

**Files:**
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Add failing service tests for streamed chat behavior**

Cover:
- run is created before provider completion
- events are persisted during streaming
- final run summary is still written
- failure path persists `run_failed`

- [ ] **Step 2: Run service tests to verify failure**

Run: `pnpm exec tsx --test src/server/agent/run-service.test.ts`
Expected: FAIL on new streaming expectations.

- [ ] **Step 3: Refactor chat orchestration**

Update chat path to:
- create run
- start running state
- invoke `streamChat(...)`
- persist events while streaming
- record billing after terminal usage is known
- complete/fail run terminal state

- [ ] **Step 4: Run service tests**

Run: `pnpm exec tsx --test src/server/agent/run-service.test.ts`
Expected: PASS

### Task 7: Add run detail and SSE API routes

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Create: `src/app/api/agent/runs/[runId]/route.ts`
- Create: `src/app/api/agent/runs/[runId]/events/route.ts`
- Create: `src/app/api/agent/runs/[runId]/route.test.ts`
- Create: `src/app/api/agent/runs/[runId]/events/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Cover:
- `POST /api/agent/runs` returns early run payload instead of waiting for final assistant text
- run detail route returns `run + events`
- SSE route emits event stream headers and ordered events

- [ ] **Step 2: Run route tests to verify failure**

Run: `pnpm exec tsx --test src/app/api/agent/runs/[runId]/route.test.ts src/app/api/agent/runs/[runId]/events/route.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement routes**

Keep route handlers thin:
- validate params
- require active account
- call repository/service helpers
- adapt to JSON or `text/event-stream`

- [ ] **Step 4: Run route tests**

Run: `pnpm exec tsx --test src/app/api/agent/runs/[runId]/route.test.ts src/app/api/agent/runs/[runId]/events/route.test.ts`
Expected: PASS

### Task 8: Extend the public runtime client for run detail and SSE

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Add failing client tests**

Cover:
- parsing run detail payload
- opening and consuming SSE events
- runtime error mapping for SSE disconnect/failure

- [ ] **Step 2: Run client tests to verify failure**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement new helpers**

Add:
- `getAgentRunDetail(runId)`
- `subscribeToAgentRunEvents(runId, callbacks)`

- [ ] **Step 4: Run client tests**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts`
Expected: PASS

### Task 9: Refactor chat page to render from replayable events

**Files:**
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Add a local reducer/projection helper**

Refactor chat page so rendered assistant text is derived from:
- run history from the detail endpoint
- live SSE events

- [ ] **Step 2: Implement conversation switching**

When active conversation changes:
- close old SSE
- load target run detail
- replay stored events
- reconnect stream if target run is still active

- [ ] **Step 3: Implement new-send flow**

On submit:
- add optimistic user message
- create run
- load run detail
- subscribe to SSE

- [ ] **Step 4: Keep summaries compatible**

Continue using `listAgentRuns()` for sidebar summaries, but stop using it as the authoritative source for active message rendering.

- [ ] **Step 5: Run focused validation**

Run: `pnpm exec eslint src/app/chat/page.tsx`
Expected: PASS

### Task 10: Final verification

**Files:**
- Modify if needed: `docs/superpowers/verification/2026-05-30-agent-run-streaming-chat-verification.md`

- [ ] **Step 1: Run targeted tests**

Run:
`pnpm exec tsx --test src/server/db/schema.agent-run-events.test.ts src/server/repositories/agent-runs.test.ts src/server/ai/provider-adapters.test.ts src/server/agent/chat-stream.test.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/[runId]/route.test.ts src/app/api/agent/runs/[runId]/events/route.test.ts src/features/public/agent-runtime-client.test.ts`

Expected: PASS

- [ ] **Step 2: Run production build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Run browser verification**

Start local app if needed, then verify:
- chat assistant text streams incrementally
- switching conversations preserves prior runs
- refresh still replays stored history

- [ ] **Step 4: Record verification note**

Save a short verification note to:
`docs/superpowers/verification/2026-05-30-agent-run-streaming-chat-verification.md`

