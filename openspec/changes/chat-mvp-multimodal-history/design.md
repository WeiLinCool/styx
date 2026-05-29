# Design: Chat MVP On Shared Agent Run Storage

## Summary

This MVP uses the existing `agent_runs` and `agent_artifacts` tables as the single persistence base for user-visible AI history across chat, image, video, and workflow tasks. Chat becomes the first fully user-facing recovery flow on top of that model.

## Architecture Decisions

### 1. Reuse `agent_runs` as the primary history record

Each chat request already creates an `agent_run` with:

- `userId`
- `taskType`
- `prompt`
- `status`
- `finalMessage`
- `input`
- timestamps

This is sufficient for MVP conversation history if the UI reads recent chat runs for the current user and maps them into chat messages.

Decision:
- Do not create a separate `conversations` table in this MVP.
- Treat one chat exchange as one persisted run.
- Use run ordering by `createdAt` to reconstruct recent history.

Tradeoff:
- This is not a full threaded conversation model.
- It keeps the MVP small and preserves a clean migration path to a future conversation/session layer if needed.

### 2. Reuse `agent_artifacts` as the common multimodal output container

The future web/app requirement is that chat, image, and video history should be restorable from a common storage shape. `agent_artifacts` already stores:

- `kind`
- `title`
- `body`
- `url`
- `metadata`

Decision:
- Keep text responses in `finalMessage` and optionally text artifacts as needed.
- Keep image/video outputs attached as artifacts on the same run.
- For later app/web restoration, the client can read one history source: runs plus artifacts.

### 3. Chat page reads history from the run API

Current `/chat` only keeps local component state plus a static sidebar stub.

Decision:
- Load recent `taskType = chat` runs for the authenticated user through `GET /api/agent/runs`.
- Render a recent conversation list from persisted runs.
- Hydrate the active view by mapping each run to:
  - one user message from `prompt`
  - one assistant message from `finalMessage` if present

### 4. Superuser seed stays in database seed/bootstrap path

The product needs a stable admin/test account at phone `18120810787`.

Decision:
- Upsert a user with phone `18120810787`
- ensure `accountState = active`
- ensure admin role `owner`
- preserve idempotency in seed logic

This keeps setup deterministic for local development and future environments that run the bootstrap path.

## Data Flow

1. User signs in with a real persisted session.
2. User opens `/chat`.
3. Client fetches recent runs via `GET /api/agent/runs`.
4. Client filters `taskType = chat` and builds the sidebar/history view.
5. User sends a prompt.
6. Client submits `POST /api/agent/runs`.
7. Server creates and executes the run using the existing run service.
8. Run result persists in `agent_runs` and `agent_artifacts`.
9. Client refreshes recent runs and updates the visible chat transcript.

## Recovery Strategy For Future Web/App

The MVP storage contract for history recovery is:

- one `agent_run` = one user AI task
- `taskType` differentiates chat/image/video/workflow
- `input` stores source-specific request context
- `finalMessage` stores primary text reply
- `agent_artifacts` stores rich/multimodal outputs

This gives web and app a shared restore path:

- list runs by `userId`
- group/filter by `taskType`
- show `finalMessage` and artifacts
- reconstruct user-visible history without relying on local device state

## Risks

1. Chat “thread” semantics remain limited because the MVP stores exchanges as independent runs.
2. The current runtime is deterministic and not a production conversational model.
3. UI mapping from runs to chat messages must stay explicit so later threaded conversations can evolve without data loss.
