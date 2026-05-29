---
archived-with: 2026-05-29-add-user-agent-runtime
status: final
status: final
---
# User Agent Runtime Design

Status: draft
Change: add-user-agent-runtime
Date: 2026-05-29

## Problem

Styx has user-facing AI pages and an admin AI job view, but the runtime path is not real yet. The chat page simulates assistant output in the browser, and image/video/workflow pages are not backed by a shared server-side request model. The product needs a user-facing model request function where users submit intent, while admins maintain the models, skills, MCP servers, and plugins that power the run.

The reference architecture is Lingwei's worker-owned `agent.run`: structured input, explicit run state, structured artifacts, and no reliance on a terminal transcript as truth. Styx should adapt the same shape to a Next.js server runtime with database-backed audit and admin configuration.

## Design Summary

Build a server-owned agent runtime in vertical slices:

1. Persist agent capability configuration and user run state.
2. Resolve admin-managed capability bundles into immutable run snapshots.
3. Execute runs through a narrow `PiAgentRuntime` adapter port.
4. Expose user APIs for create/status/history.
5. Expose admin APIs and UI for capability maintenance and run operations.
6. Connect public AI pages to the runtime API.

Users never select skills, MCP servers, or plugins. A user request carries task type, prompt, and context. The server resolves the bundle for that task type and user/account state, snapshots the resolved capabilities on the run, calls the Pi runtime adapter, and persists events/artifacts.

## Core Data Model

Add these schema concepts to `src/server/db/schema.ts`:

- `agentCapabilityKind`: `model`, `skill`, `mcp_server`, `plugin`.
- `agentCapabilityStatus`: `enabled`, `disabled`, `archived`.
- `agentRunStatus`: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- `agentArtifactKind`: `text`, `image`, `video`, `document`, `workflow`, `json`.
- `agentCapabilities`: admin-managed records with `kind`, `code`, `name`, `status`, `scope`, `config`, and server-only credential metadata.
- `agentCapabilityBundles`: task-level bundles such as `chat-default`, `image-default`, `video-default`, `workflow-default`.
- `agentCapabilityBundleItems`: ordered links from bundles to capabilities.
- `agentRuns`: user-owned run records with task type, prompt, status, provider/model, resolved capability snapshot, input metadata, final message, and error.
- `agentRunEvents`: append-only event rows for lifecycle and runtime observations.
- `agentArtifacts`: persisted outputs with kind, title, status, URL/body/metadata, and run ownership.

`ai_jobs` remains for existing admin operations. The implementation can either add `agent_run_id` later or have the admin repository merge both views. The new run tables are the source of truth for user runtime behavior.

## Runtime Boundary

Create `src/server/agent/pi-runtime.ts`:

```ts
export type AgentTaskType = 'chat' | 'image' | 'video' | 'workflow';

export type ResolvedAgentCapability = {
  id: string;
  kind: 'model' | 'skill' | 'mcp_server' | 'plugin';
  code: string;
  name: string;
  config: Record<string, unknown>;
};

export type PiAgentRunRequest = {
  runId: string;
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  provider: string;
  model: string;
  capabilities: ResolvedAgentCapability[];
  input: Record<string, unknown>;
};

export type PiAgentRunResult = {
  finalMessage: string | null;
  artifacts: Array<{
    kind: 'text' | 'image' | 'video' | 'document' | 'workflow' | 'json';
    title: string;
    body?: string | null;
    url?: string | null;
    metadata?: Record<string, unknown>;
  }>;
};

export interface PiAgentRuntime {
  run(request: PiAgentRunRequest): Promise<PiAgentRunResult>;
}
```

The first implementation uses a deterministic development adapter. It must be good enough for route tests and local smoke checks, and it keeps the future real Pi SDK integration constrained to one file or factory.

## Request Flow

```text
User page
  -> POST /api/agent/runs
  -> requireActiveAccount()
  -> validate taskType/prompt/input
  -> resolve bundle for taskType
  -> create agentRuns row with capability snapshot
  -> record queued/running events
  -> PiAgentRuntime.run(...)
  -> persist final message/artifacts/events
  -> return structured run result
```

The initial slice can execute synchronously inside the route with bounded deterministic adapter behavior. The domain model still uses queued/running/succeeded/failed so a background worker or streaming transport can be added without changing public contracts.

## User API

Add:

- `POST /api/agent/runs`
  - Body: `{ taskType, prompt, input? }`
  - Returns: `{ run: { id, status, taskType, finalMessage, artifacts, capabilitySummary } }`
- `GET /api/agent/runs/[runId]`
  - Returns the current user's own run only.
- `GET /api/agent/runs`
  - Lists recent runs for the current user.

All endpoints require an active account. They must fail closed in production when no session exists.

## Admin API And UI

Follow existing admin patterns:

- Repository modules under `src/server/repositories`.
- Route handlers under `src/app/api/admin`.
- Pages under `src/app/admin`.
- Shared table/action components under `src/features/admin`.

Add:

- `src/server/repositories/agent-capabilities.ts`
- `src/app/admin/agent-capabilities/page.tsx`
- admin mutation routes for enable/disable/update bundle membership
- admin AI operations extension to display agent runs and resolved capability snapshots

Visible admin copy must be Chinese, consistent with existing admin localization.

## Public Page Integration

Connect pages incrementally:

1. Chat: replace `setTimeout` mock response with `POST /api/agent/runs`.
2. Image generation: create image task run and render image/text artifacts.
3. Video generation: create video task run and render video/status artifacts.
4. Workflow: create workflow task run and render staged artifacts.

Existing unauthenticated and pending-activation states remain in front of runtime submission.

## Testing Strategy

Use TDD at each boundary:

- Domain tests:
  - capability bundle resolution filters disabled capabilities,
  - run snapshots remain stable after config changes,
  - status transitions handle success/failure.
- Repository tests:
  - create run with snapshot,
  - record events and artifacts,
  - deny cross-user run lookup.
- Route tests:
  - inactive users cannot create runs,
  - active users can create and fetch their own runs,
  - failures return typed JSON.
- UI smoke:
  - chat page renders assistant response from runtime,
  - admin capability page renders seed/development data when DB is unavailable.

## Risks

- The real Pi SDK contract is unknown. Mitigation: keep `PiAgentRuntime` narrow and inject it into the service.
- Synchronous route execution is not enough for long real model runs. Mitigation: model state supports queued/running now; move execution to a worker later.
- Capability config may include secrets. Mitigation: separate public capability summary from server-only config, and never return raw config from user endpoints.
- Admin scope can grow quickly. Mitigation: first build model/skill/MCP/plugin records and bundle enablement; defer complex credential testing and marketplace import.

## Acceptance Criteria

- Active users can submit a chat run and receive a server-generated assistant response.
- Protected AI pages no longer depend only on local mock responses for their primary submit flow.
- Admins can inspect configured capabilities and see which capabilities were resolved for a run.
- Runs persist status, final message, events, and artifacts.
- The implementation has a replaceable Pi runtime adapter and does not expose skills/MCP/plugins to users.
