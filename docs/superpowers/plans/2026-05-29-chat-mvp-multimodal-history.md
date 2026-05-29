---
change: chat-mvp-multimodal-history
design-doc: docs/superpowers/specs/2026-05-29-chat-mvp-multimodal-history-design.md
archived-with: 2026-05-29-chat-mvp-multimodal-history
---

# Chat MVP Multimodal History Implementation Plan

Goal: deliver the minimum viable AI chat flow on top of existing runtime storage and make the requested superuser usable for testing.

Architecture:

- reuse `agent_runs` and `agent_artifacts`
- add a chat history read path in the browser client
- make chat refresh rebuild messages from persisted runs
- reconcile the superuser seed by phone for idempotent bootstrap

Completed implementation slices:

- chat history fetch helper added to the public agent runtime client
- chat page now loads persisted `chat` runs and maps them into visible transcript messages
- chat submission refreshes persisted history instead of relying only on local state
- superuser seed for `18120810787` now reuses an existing phone-based user id and preserves owner access
