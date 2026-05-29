---
status: final
archived-with: 2026-05-29-chat-mvp-multimodal-history
status: final
---

# Chat MVP Multimodal History Design

Status: final
Change: chat-mvp-multimodal-history
Date: 2026-05-29

## Problem

Styx already has a database-backed runtime slice with `agent_runs` and `agent_artifacts`, but `/chat` still behaved like a transient page from the user perspective. The product also needs a stable operator account `18120810787` and a storage direction that can later serve both web and app for chat, image, and video history recovery.

## Design Summary

This change implements the minimum viable path:

1. Keep `agent_runs` as the canonical persisted task record.
2. Keep `agent_artifacts` as the canonical persisted output record.
3. Make `/chat` read recent `chat` runs from the runtime API and reconstruct messages on refresh.
4. Keep each chat exchange as one persisted run instead of adding a new conversation table.
5. Seed or reconcile the phone account `18120810787` as an active owner-level superuser.

## Storage Direction

The future web/app shared history model remains:

- `agent_runs` for user-owned tasks
- `taskType` to split chat/image/video/workflow
- `finalMessage` for primary text response
- `agent_artifacts` for multimodal outputs and rich attachments

This gives both web and app a shared restore path without introducing a second storage system.

## UI Recovery Model

The chat page:

- loads recent runs with `GET /api/agent/runs`
- filters to `taskType = chat`
- maps each run into:
  - one user message from `prompt`
  - one assistant message from `finalMessage`

This is intentionally simple. It is enough for MVP recovery and does not block a future threaded conversation/session abstraction.

## Superuser Design

The seed path now reconciles the requested phone account by `phone`, not only by the seed UUID. That avoids unique-key conflicts when the user already exists in the database with a different id.

The seed guarantees:

- phone `18120810787` exists
- the account is `active`
- the account has `owner` role

## Verification Target

The MVP is considered complete when:

- superuser login succeeds
- chat run creation succeeds for that user
- the persisted run can be listed back through the API
- refreshing the chat page can rebuild visible history from persisted runs
