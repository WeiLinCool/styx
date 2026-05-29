# Proposal: Chat MVP And Multimodal History Base

## Background

The current web application exposes `/chat`, `/image-gen`, and `/video-gen`, but the user-side identity flow was previously disconnected from the database-backed runtime. This caused two practical problems:

1. AI chat could submit a run, but there was no reliable end-user conversation history and recovery flow.
2. Future web/app convergence for chat, image, and video history would be blocked if each surface built its own transient state model.

The codebase already contains a reusable persistence slice with `agent_runs` and `agent_artifacts`. The MVP should build on that existing model instead of introducing a second history system.

## Goals

1. Deliver a minimal but real AI chat MVP that persists conversation runs for authenticated users.
2. Make `/chat` recover recent user chat history from persisted `agent_runs`.
3. Seed a superuser account for `18120810787` so the team has a stable operator/test account.
4. Define the storage direction for future web/app shared recovery across chat, image, and video without overbuilding the first release.

## Scope

- Persist and display recent chat history from `agent_runs`.
- Keep chat MVP within the existing deterministic runtime and current run API shape.
- Reuse `agent_artifacts` as the unified output container for text and future multimodal outputs.
- Seed or upsert the superuser phone account with admin privileges.
- Keep image/video in the same persistence model, but do not build their full recovery UI in this change.

## Non-Goals

- No full mobile app implementation.
- No cross-device sync conflict resolution beyond shared database persistence.
- No new standalone “conversation” table unless existing `agent_runs` is proven insufficient.
- No full chat thread editing, branching, or message-level streaming in this MVP.
