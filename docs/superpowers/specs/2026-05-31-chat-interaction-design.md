# AI Chat Interaction Design

Date: 2026-05-31

## Scope

Improve the current user chat surface without changing the agent runtime contract or introducing multi-turn durable conversations. The work covers:

- streaming assistant display that does not jump to a full replacement at completion,
- Markdown rendering for assistant answers,
- collapse and expand controls for long completed assistant answers,
- user-side removal of left-sidebar chat history through soft deletion.

## Current Context

The chat page is a client component at `src/app/chat/page.tsx`. It lists `agent_runs`, loads a selected run detail, and maps one run into a user message plus an assistant message reconstructed from stream events or `finalMessage`.

The runtime already persists stream events and exposes `assistant_delta`, `run_completed`, and `run_failed` over SSE. The current UI renders message content as plain text and replaces the assistant message with the final message on completion.

## State Ownership

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Run visibility in chat history | Database and `AgentRunRepository` | `softDeleteRunForUser(runId, userId)` | `agent_runs.deleted_at is null` |
| Current selected run | Chat page UI | selecting/new/deleting a run | Derived client state |
| Stream connection target | Chat page UI | run creation/deletion/completion/failure | Derived client state |
| Message expansion state | Chat page UI | expand/collapse button | Derived client state |
| Assistant content | Agent runtime stream events and final run state | runtime event persistence | run detail API |

## Invariants

1. A soft-deleted run must not appear in the user's history list.
2. A soft-deleted run must not load through the user run detail API.
3. The UI must not treat local removal as durable truth; deletion visibility is enforced by repository queries.
4. Assistant streaming must append visible deltas as they arrive and must not perform an unnecessary full-message replacement at completion.

## Data And API Design

Add a nullable `deleted_at` timestamp to `agent_runs`.

Add repository method:

```ts
softDeleteRunForUser(runId: string, userId: string): Promise<AgentRunDto | null>
```

The method updates only rows matching both `id` and `user_id` and only when `deleted_at is null`. It sets `deleted_at` and `updated_at`, then returns the updated DTO or `null`.

Repository reads for user-visible chat surfaces will filter out `deleted_at`:

- `listRunsForUser`
- `getRunForUser`
- `getRunDetailForUser`

Add `DELETE /api/agent/runs/[runId]`. It requires an active account, calls the repository method, and returns `404 run_not_found` when the run is missing, owned by another user, or already deleted.

## UI Design

The left history list keeps the current compact layout and adds a small trash icon button per row. The row remains selectable; the delete button stops event propagation and asks for confirmation before mutation.

On delete success:

- remove the run from `recentRuns`,
- clear the current messages if the deleted run is selected,
- clear `selectedRunId`,
- clear `streamRunId` if it matches the deleted run.

On delete failure, retain the list item and show the existing page-level error message.

Assistant messages use a dedicated Markdown renderer. User messages remain plain text.

Long assistant messages collapse only after generation has completed. During streaming, the full accumulating content remains visible. A completed assistant message is considered long when it exceeds a conservative threshold such as 1200 characters. Collapsed messages show a clipped body and an explicit expand control; expanded messages show the full Markdown body and a collapse control.

The SSE completion handler should keep the currently streamed content when it already has content. It may use `finalMessage` only to fill an empty assistant message or correct an obvious mismatch.

## Error Handling

- Unauthorized or inactive users continue through existing `requireActiveAccount` handling.
- Delete races return `404` and are shown as a user-facing failure.
- Stream errors keep the current behavior of closing the event source and clearing stream state on terminal events.
- If a deleted run was selected while a detail load is in flight, the selected-run guard prevents stale messages from being restored.

## Verification

Lowest meaningful checks:

- repository tests for soft deletion filtering and ownership behavior,
- route/client tests where existing patterns make them cheap,
- `pnpm validate`,
- `pnpm build` for App Router and dependency wiring,
- browser verification of chat history deletion, Markdown rendering, and long-answer collapse if local auth/database setup is available.

If database-backed browser verification is blocked by local infrastructure, record the blocker and run non-database checks.
