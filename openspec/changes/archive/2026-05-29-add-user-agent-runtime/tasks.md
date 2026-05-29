## 1. Agent Domain And Persistence

- [x] 1.1 Add failing domain tests for capability resolution, run state transitions, and run ownership checks.
- [x] 1.2 Add Drizzle schema and migration for agent capabilities, bundles, runs, events, and artifacts.
- [x] 1.3 Implement repository functions for admin capability maintenance, user run creation, run lookup, event recording, and artifact recording.

## 2. Pi Runtime Adapter

- [x] 2.1 Define `PiAgentRuntime` request/result types and tests for success and failure behavior.
- [x] 2.2 Implement a deterministic development adapter that produces structured messages/artifacts without external Pi credentials.
- [x] 2.3 Implement the service that resolves admin capability bundles, snapshots them, calls the Pi runtime adapter, and persists run events.

## 3. User Runtime API

- [x] 3.1 Add authenticated user endpoints to create agent runs, fetch run status, and list the current user's run history.
- [x] 3.2 Add request validation for task type, prompt, attachments/context metadata, and ownership boundaries.
- [x] 3.3 Add typed client helpers for chat/image/video/workflow pages.

## 4. Admin Capability And Operations UI

- [x] 4.1 Add admin repository queries and mutation endpoints for models, skills, MCP servers, plugins, and capability bundles.
- [x] 4.2 Add admin UI surfaces for capability maintenance using existing admin module patterns and Chinese operator copy.
- [x] 4.3 Extend AI operations view to show agent runs, resolved capability snapshots, artifacts, and failure summaries.

## 5. Public Page Integration

- [x] 5.1 Replace chat page mock response flow with the agent run API and status rendering.
- [x] 5.2 Connect image, video, and workflow pages to create runs and render server artifact states.
- [x] 5.3 Preserve pending-activation and unauthenticated guard behavior across all protected AI tools.

## 6. Verification

- [x] 6.1 Run focused domain, repository, and route handler tests.
- [x] 6.2 Run TypeScript and lint validation.
- [x] 6.3 Smoke test representative user and admin routes with the development adapter.
