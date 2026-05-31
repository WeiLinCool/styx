# Agent Run Streaming Chat Design

## Summary

This change upgrades the current chat implementation from a final-response polling model to a true streaming run-event architecture. Chat will be the first fully implemented surface, but the event model, persistence shape, and replay contract will be designed so image and video runs can adopt the same infrastructure later without reworking conversation state.

The core decision is to make persisted run events the single source of truth for replayable UI state. SSE becomes a transport for live updates, not the durable state owner. A chat session can therefore be rendered from historical database events, resumed after refresh, and continued while a run is still streaming.

## Problem

The current chat experience is not a real streamed conversation:

- [`src/app/chat/page.tsx`](/Users/wlz/Documents/codeSpace/styx/src/app/chat/page.tsx:1) sends a prompt, waits for `createAgentRun(...)` to finish, then reloads all runs.
- [`src/app/api/agent/runs/route.ts`](/Users/wlz/Documents/codeSpace/styx/src/app/api/agent/runs/route.ts:1) returns only a final `run` JSON payload.
- [`src/server/agent/run-service.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/agent/run-service.ts:1) captures only final provider output, billing, and terminal run status.
- The UI therefore displays an after-the-fact summary such as `Development response from deepseek-v4-flash` with model and billing metadata, rather than a live assistant response.

This is insufficient because the user explicitly wants:

1. true chat SSE output
2. service-side provider streaming rather than client-side fake typing
3. replayability when the user switches conversations
4. a design that will later support image and video generation runs

## Industry Pattern

Industry consensus -> Real-time AI interfaces that need session switching and refresh safety separate durable run state from transient transport. They persist ordered run events, replay those events to reconstruct UI, and optionally stream the same event shapes over SSE or WebSocket.

Transferable principle -> The replay model must be identical for history and live traffic. A single event reducer should be able to consume both database-loaded history and live streaming updates.

This repository's constraints -> The product already models work as durable `agent_runs`, and later must support chat, image, and video. The clean path is to add a durable ordered event log per run, then make chat the first consumer.

Local design -> Add `agent_run_events`, add a chat streaming provider contract, push live updates through SSE, persist aggregated content deltas as replayable events, and render the chat page entirely from `run + ordered events`.

## State Ownership

### Durable state

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Run lifecycle (`queued/running/succeeded/failed`) | Agent run service | Run orchestration | `agent_runs` |
| Ordered intermediate run events | Agent run event repository | Streaming bridge / run orchestration | `agent_run_events` |
| Final assistant summary text | Agent run service | Run completion | `agent_runs.final_message` |
| Billing result | Agent run service | Billing completion | `agent_runs.capability_snapshot.billing` + ledger |
| Provider usage summary | Agent run service | Terminal provider result | `agent_runs.capability_snapshot` |

### Derived state

- Rendered assistant message text for a conversation
- Whether a run is currently streaming
- First-token timing and progress indicators
- Reconstructed artifact/progress UI for future image/video runs

## Invariants

1. A run's replayable UI state must be derivable only from `agent_runs` plus ordered `agent_run_events`.
2. SSE is not allowed to introduce state that cannot later be recovered from persisted events.
3. Per-run event `sequence` values must be strictly increasing and stable for replay.

## Scope

### In scope now

- Real streamed chat provider output
- SSE endpoint for live run events
- Durable run-event persistence for chat
- Chat page reducer-based replay and live rendering
- Run detail API for loading a single conversation with events
- Event shapes and database contract designed for later image/video reuse

### Explicitly not in scope now

- Full image generation streaming UI
- Full video generation streaming UI
- Workflow task streaming UI
- Token-by-token persistence
- WebSocket transport

## Data Model

### Existing table reuse: `agent_runs`

Keep `agent_runs` as the authoritative run header and final summary record:

- status
- task type
- prompt
- provider/model
- final message
- final capability snapshot
- created/running/completed timestamps

### New table: `agent_run_events`

Purpose: store replayable ordered events for one run.

Suggested fields:

- `id`
- `run_id`
- `sequence`
- `event_type`
- `payload`
- `created_at`

Suggested constraints:

- foreign key to `agent_runs.id` with cascade delete
- unique `(run_id, sequence)`
- index on `(run_id, sequence)`

### Event types for this phase

- `run_started`
- `assistant_message_started`
- `assistant_delta`
- `assistant_message_completed`
- `billing_recorded`
- `run_completed`
- `run_failed`

### Reserved event types for future image/video

- `artifact_started`
- `artifact_progress`
- `artifact_completed`
- `artifact_failed`

## Event Payload Contract

### `run_started`

Payload:

- `taskType`
- `provider`
- `model`
- `startedAt`

### `assistant_message_started`

Payload:

- `messageId`
- `role = assistant`

### `assistant_delta`

Payload:

- `messageId`
- `delta`

This phase uses aggregated chunk persistence rather than per-token persistence. The server may batch provider tokens and flush every small text window or short time interval.

### `assistant_message_completed`

Payload:

- `messageId`
- `finalLength`

### `billing_recorded`

Payload:

- `creditCost`
- `ledgerEntryId`
- `balanceAfter`

### `run_completed`

Payload:

- `finalMessage`
- `usage`
- `completedAt`

### `run_failed`

Payload:

- `message`
- `failedAt`

## Service Architecture

### 1. Run orchestration

Owner: [`src/server/agent/run-service.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/agent/run-service.ts:1)

Responsibilities:

- create run header
- mark run running/completed/failed
- coordinate provider streaming
- coordinate billing
- write terminal summary to `agent_runs`

### 2. Event repository

Owner: [`src/server/repositories/agent-runs.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/repositories/agent-runs.ts:1)

Responsibilities:

- append ordered events with next `sequence`
- list events for one run
- optionally record observational events in the existing repository abstraction

### 3. Streaming bridge

New focused server module under `src/server/agent/`

Responsibilities:

- consume streaming provider output
- emit live SSE-safe event objects
- batch and persist `assistant_delta` chunks
- finalize completion/failure events

### 4. Provider adapter

Owner: [`src/server/ai/provider-adapters.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/ai/provider-adapters.ts:1)

Chat adapters should support both:

- current terminal request mode for compatibility
- new `streamChat(...)` mode that yields content deltas and a final usage summary

## API Design

### `POST /api/agent/runs`

Change behavior:

- Validate request and create the run
- Start orchestration
- Return the created run header immediately rather than waiting for final model output

Transport note:

- The actual live tokens flow over a separate SSE endpoint

### `GET /api/agent/runs`

Keep current list behavior for conversation summaries and recent run lists.

### `GET /api/agent/runs/[runId]`

New endpoint returning:

- run header
- ordered run events

Purpose:

- session switching
- refresh recovery
- initial load before SSE connection

### `GET /api/agent/runs/[runId]/events`

New SSE endpoint:

- `Content-Type: text/event-stream`
- emits the same event shapes that are persisted
- closes when the run reaches a terminal state

## Frontend Rendering Model

### Chat page state split

- conversation summaries from run list
- active run id
- loaded run details (`run + events`)
- live stream connection state
- rendered messages derived from an event reducer

### Reducer rule

The same reducer must accept:

- history loaded from the database
- live SSE events

This guarantees that:

- switching conversations replays correctly
- refresh recovery matches live rendering
- image/video can later reuse the same projection logic

### Optimistic behavior

When a user submits:

- insert optimistic user message locally
- create run and receive `runId`
- load run details
- connect SSE

When switching conversations:

- close current SSE stream
- load target run details
- replay target events
- if target run is still running, reconnect SSE for that run

## Failure Handling

- Provider stream error -> persist `run_failed`, fail the run, push terminal SSE event
- SSE disconnect -> client can reconnect by reloading run details; no in-memory-only state is lost
- Persistence failure for a delta batch -> fail the run rather than producing unreplayable UI
- Billing failure after provider completion -> mark run failed and persist terminal failure event

## Future Compatibility For Image / Video

This phase does not implement image/video streaming UI, but it fixes the contract now:

- image/video runs will still be represented by `agent_runs`
- intermediate artifact lifecycle will use `agent_run_events`
- the same run detail endpoint and SSE endpoint can stream progress
- the same conversation/session selection model can replay progress and final artifacts

## Verification Strategy

### Logic tests

- event reducer replay from stored history
- reducer equivalence between historical replay and live event ingestion
- chunk aggregation behavior for assistant deltas

### Repository tests

- ordered event append sequence correctness
- list events by run and sequence

### Service tests

- mock streaming provider produces persisted delta events
- terminal completion writes both final run summary and completion event
- provider failure writes failure event and failed run state
- billing event persists after usage is known

### API tests

- create run returns early run payload
- run detail endpoint returns run plus events
- SSE endpoint emits ordered events and closes on terminal state

### Browser verification

- streamed assistant text appears incrementally
- switching to another run and back reconstructs prior content
- refreshing chat page replays stored event history

