---
change: add-user-agent-runtime
design-doc: docs/superpowers/specs/2026-05-29-user-agent-runtime-design.md
base-ref: dfd66eb0d1ffd85b6acce85b2eb75f747f5e0cc2
archived-with: 2026-05-29-add-user-agent-runtime
---

# User Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-owned user agent runtime where active users submit model requests and admins maintain model, skill, MCP, plugin, and bundle capabilities.

**Architecture:** Add a database-backed agent domain beside existing `ai_jobs`, with immutable capability snapshots per run. Execute requests through an injected `PiAgentRuntime` adapter so the first slice works with a deterministic development adapter and can later bind to the real Pi runtime. Integrate chat first, then reuse the same client helper for image, video, and workflow pages.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM/PostgreSQL, Zod, Node test runner via `tsx --test`, existing admin module components, React client pages.

archived-with: 2026-05-29-add-user-agent-runtime
---

## File Structure

- `src/server/agent/types.ts`: shared domain types for task type, run status, capability snapshots, artifacts, and API DTOs.
- `src/server/agent/capability-resolution.ts`: pure functions that select enabled capabilities and build immutable snapshots.
- `src/server/agent/pi-runtime.ts`: `PiAgentRuntime` interface and deterministic development adapter.
- `src/server/agent/run-service.ts`: orchestration service that creates runs, calls the runtime, and records events/artifacts.
- `src/server/repositories/agent-runs.ts`: database and seed-backed run persistence.
- `src/server/repositories/agent-capabilities.ts`: database and seed-backed admin capability maintenance reads.
- `src/app/api/agent/runs/route.ts`: user create/list endpoints.
- `src/app/api/agent/runs/[runId]/route.ts`: user status endpoint.
- `src/app/admin/agent-capabilities/page.tsx`: admin capability maintenance page.
- `src/app/api/admin/agent-capabilities/[capabilityId]/status/route.ts`: admin enable/disable mutation.
- `src/features/public/agent-runtime-client.ts`: browser helper used by public AI pages.
- Existing pages: `src/app/chat/page.tsx`, `src/app/image-gen/page.tsx`, `src/app/video-gen/page.tsx`, `src/app/workflow/page.tsx`.
- Existing admin files: `src/features/admin/admin-nav.tsx`, `src/server/repositories/ai-jobs.ts`, `src/app/admin/ai-jobs/page.tsx`.

### Task 1: Agent Domain And Persistence

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/agent/types.ts`
- Create: `src/server/agent/capability-resolution.ts`
- Create: `src/server/agent/capability-resolution.test.ts`
- Create: `src/server/repositories/agent-runs.ts`
- Create: `src/server/repositories/agent-runs.test.ts`
- Create: `src/server/repositories/agent-capabilities.ts`

- [ ] **Step 1: Write failing capability resolution tests**

Create `src/server/agent/capability-resolution.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCapabilitySnapshot,
  resolveDefaultBundle,
} from './capability-resolution';
import type { AgentCapabilityRecord, AgentCapabilityBundleRecord } from './types';

const capabilities: AgentCapabilityRecord[] = [
  {
    id: 'model-1',
    kind: 'model',
    code: 'pi-chat',
    name: 'Pi Chat',
    status: 'enabled',
    config: { provider: 'pi', model: 'pi-default' },
  },
  {
    id: 'skill-1',
    kind: 'skill',
    code: 'stone-script',
    name: 'Stone Script',
    status: 'enabled',
    config: { prompt: '石头印画脚本' },
  },
  {
    id: 'plugin-1',
    kind: 'plugin',
    code: 'unsafe-plugin',
    name: 'Unsafe Plugin',
    status: 'disabled',
    config: {},
  },
];

const bundles: AgentCapabilityBundleRecord[] = [
  {
    id: 'bundle-chat',
    code: 'chat-default',
    taskType: 'chat',
    name: 'Chat Default',
    status: 'enabled',
    capabilityIds: ['model-1', 'skill-1', 'plugin-1'],
  },
];

test('resolveDefaultBundle returns enabled bundle for task type', () => {
  const bundle = resolveDefaultBundle(bundles, 'chat');

  assert.equal(bundle?.id, 'bundle-chat');
});

test('buildCapabilitySnapshot includes enabled capabilities and excludes disabled capabilities', () => {
  const snapshot = buildCapabilitySnapshot({
    bundle: bundles[0],
    capabilities,
  });

  assert.deepEqual(
    snapshot.capabilities.map((capability) => capability.code),
    ['pi-chat', 'stone-script'],
  );
  assert.equal(snapshot.provider, 'pi');
  assert.equal(snapshot.model, 'pi-default');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/agent/capability-resolution.test.ts
```

Expected: FAIL because `capability-resolution.ts` and `types.ts` do not exist.

- [ ] **Step 3: Implement domain types and pure resolver**

Create `src/server/agent/types.ts`:

```ts
export type AgentTaskType = 'chat' | 'image' | 'video' | 'workflow';
export type AgentCapabilityKind = 'model' | 'skill' | 'mcp_server' | 'plugin';
export type AgentCapabilityStatus = 'enabled' | 'disabled' | 'archived';
export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type AgentArtifactKind = 'text' | 'image' | 'video' | 'document' | 'workflow' | 'json';

export type AgentCapabilityRecord = {
  id: string;
  kind: AgentCapabilityKind;
  code: string;
  name: string;
  status: AgentCapabilityStatus;
  config: Record<string, unknown>;
};

export type AgentCapabilityBundleRecord = {
  id: string;
  code: string;
  taskType: AgentTaskType;
  name: string;
  status: AgentCapabilityStatus;
  capabilityIds: string[];
};

export type ResolvedAgentCapability = {
  id: string;
  kind: AgentCapabilityKind;
  code: string;
  name: string;
  config: Record<string, unknown>;
};

export type AgentCapabilitySnapshot = {
  bundleId: string;
  bundleCode: string;
  provider: string;
  model: string;
  capabilities: ResolvedAgentCapability[];
};

export type AgentArtifactDto = {
  id: string;
  kind: AgentArtifactKind;
  title: string;
  status: 'ready' | 'failed';
  body: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentRunDto = {
  id: string;
  taskType: AgentTaskType;
  status: AgentRunStatus;
  prompt: string;
  finalMessage: string | null;
  errorMessage: string | null;
  capabilitySummary: {
    provider: string;
    model: string;
    capabilities: Array<Pick<ResolvedAgentCapability, 'kind' | 'code' | 'name'>>;
  };
  artifacts: AgentArtifactDto[];
  createdAt: string;
  updatedAt: string;
};
```

Create `src/server/agent/capability-resolution.ts`:

```ts
import type {
  AgentCapabilityBundleRecord,
  AgentCapabilityRecord,
  AgentCapabilitySnapshot,
  AgentTaskType,
  ResolvedAgentCapability,
} from './types';

function readStringConfig(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function resolveDefaultBundle(
  bundles: AgentCapabilityBundleRecord[],
  taskType: AgentTaskType,
) {
  return bundles.find((bundle) => bundle.taskType === taskType && bundle.status === 'enabled') ?? null;
}

export function buildCapabilitySnapshot(input: {
  bundle: AgentCapabilityBundleRecord;
  capabilities: AgentCapabilityRecord[];
}): AgentCapabilitySnapshot {
  const byId = new Map(input.capabilities.map((capability) => [capability.id, capability]));
  const resolved: ResolvedAgentCapability[] = input.bundle.capabilityIds
    .map((id) => byId.get(id))
    .filter((capability): capability is AgentCapabilityRecord => Boolean(capability))
    .filter((capability) => capability.status === 'enabled')
    .map((capability) => ({
      id: capability.id,
      kind: capability.kind,
      code: capability.code,
      name: capability.name,
      config: capability.config,
    }));

  const modelCapability = resolved.find((capability) => capability.kind === 'model');

  return {
    bundleId: input.bundle.id,
    bundleCode: input.bundle.code,
    provider: modelCapability ? readStringConfig(modelCapability.config, 'provider', 'pi') : 'pi',
    model: modelCapability ? readStringConfig(modelCapability.config, 'model', 'pi-default') : 'pi-default',
    capabilities: resolved,
  };
}
```

Add schema enums/tables to `src/server/db/schema.ts` following existing table style:

```ts
export const agentCapabilityKind = pgEnum('agent_capability_kind', [
  'model',
  'skill',
  'mcp_server',
  'plugin',
]);

export const agentCapabilityStatus = pgEnum('agent_capability_status', [
  'enabled',
  'disabled',
  'archived',
]);

export const agentRunStatus = pgEnum('agent_run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const agentArtifactKind = pgEnum('agent_artifact_kind', [
  'text',
  'image',
  'video',
  'document',
  'workflow',
  'json',
]);
```

Add tables:

```ts
export const agentCapabilities = pgTable(
  'agent_capabilities',
  {
    id,
    kind: agentCapabilityKind('kind').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: agentCapabilityStatus('status').notNull().default('enabled'),
    scope: text('scope').notNull().default('global'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    secretMetadata: jsonb('secret_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('agent_capabilities_code_unique_idx').on(table.code),
    index('agent_capabilities_kind_idx').on(table.kind),
    index('agent_capabilities_status_idx').on(table.status),
  ],
);

export const agentCapabilityBundles = pgTable(
  'agent_capability_bundles',
  {
    id,
    code: text('code').notNull(),
    taskType: aiJobType('task_type').notNull(),
    name: text('name').notNull(),
    status: agentCapabilityStatus('status').notNull().default('enabled'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('agent_capability_bundles_code_unique_idx').on(table.code),
    index('agent_capability_bundles_task_type_idx').on(table.taskType),
  ],
);

export const agentCapabilityBundleItems = pgTable(
  'agent_capability_bundle_items',
  {
    bundleId: uuid('bundle_id')
      .notNull()
      .references(() => agentCapabilityBundles.id, { onDelete: 'cascade' }),
    capabilityId: uuid('capability_id')
      .notNull()
      .references(() => agentCapabilities.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: now,
  },
  (table) => [
    primaryKey({ columns: [table.bundleId, table.capabilityId] }),
    index('agent_capability_bundle_items_capability_idx').on(table.capabilityId),
  ],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskType: aiJobType('task_type').notNull(),
    status: agentRunStatus('status').notNull().default('queued'),
    prompt: text('prompt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    capabilitySnapshot: jsonb('capability_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    finalMessage: text('final_message'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('agent_runs_user_id_idx').on(table.userId),
    index('agent_runs_status_idx').on(table.status),
    index('agent_runs_task_type_idx').on(table.taskType),
  ],
);

export const agentRunEvents = pgTable(
  'agent_run_events',
  {
    id,
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('agent_run_events_run_id_idx').on(table.runId),
    index('agent_run_events_type_idx').on(table.type),
  ],
);

export const agentArtifacts = pgTable(
  'agent_artifacts',
  {
    id,
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: agentArtifactKind('kind').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('ready'),
    body: text('body'),
    url: text('url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('agent_artifacts_run_id_idx').on(table.runId),
    index('agent_artifacts_kind_idx').on(table.kind),
  ],
);
```

- [ ] **Step 4: Run capability test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/server/agent/capability-resolution.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing repository ownership tests**

Create `src/server/repositories/agent-runs.test.ts` with a memory repository API test:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryAgentRunRepository,
} from './agent-runs';

test('memory agent run repository returns only runs owned by the requesting user', async () => {
  const repo = createMemoryAgentRunRepository();
  const aliceRun = await repo.createRun({
    userId: 'user-alice',
    taskType: 'chat',
    prompt: '帮我写提示词',
    provider: 'pi',
    model: 'pi-default',
    capabilitySnapshot: {
      bundleId: 'bundle-chat',
      bundleCode: 'chat-default',
      provider: 'pi',
      model: 'pi-default',
      capabilities: [],
    },
    input: {},
  });

  await repo.createRun({
    userId: 'user-bob',
    taskType: 'chat',
    prompt: 'Bob prompt',
    provider: 'pi',
    model: 'pi-default',
    capabilitySnapshot: {
      bundleId: 'bundle-chat',
      bundleCode: 'chat-default',
      provider: 'pi',
      model: 'pi-default',
      capabilities: [],
    },
    input: {},
  });

  assert.equal((await repo.getRunForUser(aliceRun.id, 'user-alice'))?.id, aliceRun.id);
  assert.equal(await repo.getRunForUser(aliceRun.id, 'user-bob'), null);
  assert.equal((await repo.listRunsForUser('user-alice')).length, 1);
});
```

- [ ] **Step 6: Run repository test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-runs.test.ts
```

Expected: FAIL because repository functions do not exist.

- [ ] **Step 7: Implement memory repository and database-backed function stubs**

Create `src/server/repositories/agent-runs.ts` with a memory repository first. It must expose `createMemoryAgentRunRepository()` for tests and exported async functions for routes that can fall back to an in-memory development repository when `db` is unavailable. Use `crypto.randomUUID()` for ids and map rows to `AgentRunDto`.

Create `src/server/repositories/agent-capabilities.ts` with seed records:

```ts
export const seedAgentCapabilities = [
  { id: 'seed-model-pi', kind: 'model', code: 'pi-default', name: 'Pi 默认模型', status: 'enabled', config: { provider: 'pi', model: 'pi-default' } },
  { id: 'seed-skill-stone-script', kind: 'skill', code: 'stone-script', name: '石头印画脚本 Skill', status: 'enabled', config: { prompt: '生成石头印画相关脚本。' } },
  { id: 'seed-mcp-assets', kind: 'mcp_server', code: 'asset-library', name: '素材库 MCP', status: 'enabled', config: { server: 'asset-library' } },
  { id: 'seed-plugin-export', kind: 'plugin', code: 'artifact-export', name: '产物导出 Plugin', status: 'enabled', config: { formats: ['text', 'json'] } },
] satisfies AgentCapabilityRecord[];
```

Provide `getDefaultAgentCapabilityBundle(taskType)` that uses the pure resolver.

- [ ] **Step 8: Run repository and capability tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/capability-resolution.test.ts src/server/repositories/agent-runs.test.ts
```

Expected: PASS.

- [ ] **Step 9: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: Drizzle creates a new migration for agent capability and run tables.

- [ ] **Step 10: Commit**

```bash
git add src/server/db/schema.ts src/server/agent src/server/repositories/agent-runs.ts src/server/repositories/agent-runs.test.ts src/server/repositories/agent-capabilities.ts drizzle
git commit -m "feat: add agent runtime persistence"
```

### Task 2: Pi Runtime Adapter And Run Service

**Files:**
- Create: `src/server/agent/pi-runtime.ts`
- Create: `src/server/agent/run-service.ts`
- Create: `src/server/agent/run-service.test.ts`
- Modify: `src/server/repositories/agent-runs.ts`

- [ ] **Step 1: Write failing run service tests**

Create `src/server/agent/run-service.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryAgentRunRepository } from '@/server/repositories/agent-runs';
import { createDeterministicPiRuntime } from './pi-runtime';
import { createAgentRunService } from './run-service';

test('createAndRunAgentRun completes run with deterministic Pi adapter output', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
  });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: '帮我设计一个石头印画作品',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.match(run.finalMessage ?? '', /石头印画作品/);
  assert.equal(run.capabilitySummary.provider, 'pi');
  assert.equal(run.artifacts.length, 1);
});

test('createAndRunAgentRun records failure when runtime throws', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('pi unavailable');
      },
    },
  });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    input: {},
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.errorMessage, 'pi unavailable');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: FAIL because runtime and service modules do not exist.

- [ ] **Step 3: Implement runtime adapter**

Create `src/server/agent/pi-runtime.ts` using the interface from the design doc. `createDeterministicPiRuntime()` should return a final message like:

```ts
`已通过 ${request.provider}/${request.model} 处理：${request.prompt}`
```

and one text artifact titled `AI 回复`.

- [ ] **Step 4: Implement run service**

Create `src/server/agent/run-service.ts` with `createAgentRunService({ repository, runtime })`. The service must:

- resolve the default capability bundle for `taskType`,
- create a queued run,
- mark it running,
- call runtime,
- mark succeeded and add artifacts,
- catch runtime errors and mark failed.

Extend `AgentRunRepository` in `src/server/repositories/agent-runs.ts` with `markRunRunning`, `completeRun`, `failRun`, `recordEvent`, and `addArtifact`.

- [ ] **Step 5: Run service tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/capability-resolution.test.ts src/server/repositories/agent-runs.test.ts src/server/agent/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/agent/pi-runtime.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts src/server/repositories/agent-runs.ts
git commit -m "feat: execute agent runs through pi adapter"
```

### Task 3: User Runtime API

**Files:**
- Create: `src/app/api/agent/runs/route.ts`
- Create: `src/app/api/agent/runs/[runId]/route.ts`
- Create: `src/app/api/agent/runs/route.test.ts`
- Create: `src/features/public/agent-runtime-client.ts`

- [ ] **Step 1: Write failing API route tests**

Create `src/app/api/agent/runs/route.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCreateAgentRunBody } from './route';

test('parseCreateAgentRunBody accepts valid chat request', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'chat',
    prompt: '帮我写提示词',
    input: { source: 'chat' },
  });

  assert.deepEqual(parsed, {
    taskType: 'chat',
    prompt: '帮我写提示词',
    input: { source: 'chat' },
  });
});

test('parseCreateAgentRunBody rejects empty prompt', () => {
  assert.throws(
    () => parseCreateAgentRunBody({ taskType: 'chat', prompt: '   ' }),
    /Prompt is required/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: FAIL because route parser does not exist.

- [ ] **Step 3: Implement user endpoints**

Implement:

- `parseCreateAgentRunBody` exported for tests with Zod validation.
- `POST /api/agent/runs` using `requireActiveAccount()`, `createAgentRunService`, and deterministic runtime factory.
- `GET /api/agent/runs` listing current user's runs.
- `GET /api/agent/runs/[runId]` returning only current user's run.

Return typed JSON errors:

```ts
{ error: { code: 'invalid_request', message: 'Prompt is required.' } }
```

- [ ] **Step 4: Add browser client helper**

Create `src/features/public/agent-runtime-client.ts`:

```ts
import type { AgentRunDto, AgentTaskType } from '@/server/agent/types';

export async function createAgentRun(input: {
  taskType: AgentTaskType;
  prompt: string;
  input?: Record<string, unknown>;
}): Promise<AgentRunDto> {
  const response = await fetch('/api/agent/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'AI 请求失败');
  }
  return payload.run as AgentRunDto;
}
```

- [ ] **Step 5: Run API tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/server/agent/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent src/features/public/agent-runtime-client.ts
git commit -m "feat: add user agent run api"
```

### Task 4: Admin Capability And Operations UI

**Files:**
- Create: `src/app/admin/agent-capabilities/page.tsx`
- Create: `src/app/api/admin/agent-capabilities/[capabilityId]/status/route.ts`
- Modify: `src/features/admin/admin-nav.tsx`
- Modify: `src/server/repositories/agent-capabilities.ts`
- Modify: `src/server/repositories/ai-jobs.ts`
- Modify: `src/app/admin/ai-jobs/page.tsx`

- [ ] **Step 1: Write failing admin repository test**

Create `src/server/repositories/agent-capabilities.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { getSeedAgentCapabilityAdminData } from './agent-capabilities';

test('getSeedAgentCapabilityAdminData exposes capability records and metrics', () => {
  const data = getSeedAgentCapabilityAdminData();

  assert.equal(data.source, 'seed');
  assert.ok(data.records.some((record) => record.kind === 'skill'));
  assert.ok(data.metrics.some((metric) => metric.label === '能力数'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
```

Expected: FAIL until admin data mapper exists.

- [ ] **Step 3: Implement admin data mapper**

In `src/server/repositories/agent-capabilities.ts`, add:

```ts
export type AdminAgentCapabilityRow = {
  id: string;
  kind: string;
  code: string;
  name: string;
  status: string;
  scope: string;
  configSummary: string;
};
```

Implement `getSeedAgentCapabilityAdminData()` and `getAdminAgentCapabilities()` returning `AdminModuleData<AdminAgentCapabilityRow>`.

- [ ] **Step 4: Add admin page and nav**

Add `src/app/admin/agent-capabilities/page.tsx` using `AdminModulePage` with Chinese title `Agent 能力`. Add nav item in `src/features/admin/admin-nav.tsx` with `Bot` or `Settings2` icon.

- [ ] **Step 5: Extend AI jobs operations view**

Modify `src/server/repositories/ai-jobs.ts` so seed/database rows can include agent run provider/model/capability summary when available. Keep current columns compatible. Update `src/app/admin/ai-jobs/page.tsx` description to mention Agent runs and capability snapshots.

- [ ] **Step 6: Run admin tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts src/server/repositories/admin-modules.test.ts src/server/repositories/admin-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories/agent-capabilities.ts src/server/repositories/agent-capabilities.test.ts src/app/admin/agent-capabilities src/app/api/admin/agent-capabilities src/features/admin/admin-nav.tsx src/server/repositories/ai-jobs.ts src/app/admin/ai-jobs/page.tsx
git commit -m "feat: add admin agent capability management"
```

### Task 5: Public Page Integration

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `src/app/image-gen/page.tsx`
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/app/workflow/page.tsx`

- [ ] **Step 1: Integrate chat page**

In `src/app/chat/page.tsx`, replace the simulated `setTimeout` response with `createAgentRun({ taskType: 'chat', prompt })`. Add `isSubmitting` and error state. Render `run.finalMessage` as assistant content.

Keep these existing guards:

```ts
if (!isLoggedIn) { openLoginModal(); return; }
if (!user || requiresActivation(user)) return;
```

- [ ] **Step 2: Run TypeScript check for chat integration**

Run:

```bash
pnpm run ts-check
```

Expected: PASS or only pre-existing unrelated errors documented before continuing.

- [ ] **Step 3: Integrate image, video, and workflow submits**

Use `createAgentRun` in the primary submit/generate handlers:

- image page: `taskType: 'image'`
- video page: `taskType: 'video'`
- workflow page: `taskType: 'workflow'`

Render server failure messages in the existing status/error areas. Keep existing local preview UI where it represents user input, but use server artifacts for completed output when present.

- [ ] **Step 4: Run validation**

Run:

```bash
pnpm run validate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/chat/page.tsx src/app/image-gen/page.tsx src/app/video-gen/page.tsx src/app/workflow/page.tsx
git commit -m "feat: connect public ai tools to agent runtime"
```

### Task 6: Verification And OpenSpec Task Closure

**Files:**
- Modify: `openspec/changes/add-user-agent-runtime/tasks.md`
- Create: `docs/superpowers/verification/2026-05-29-user-agent-runtime-verification.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/capability-resolution.test.ts src/server/repositories/agent-runs.test.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts src/server/repositories/agent-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run project validation**

Run:

```bash
pnpm run validate
```

Expected: PASS.

- [ ] **Step 3: Run route smoke checks**

Start the dev server:

```bash
pnpm dev
```

Then request:

```bash
curl -I http://localhost:3000/chat
curl -I http://localhost:3000/admin/agent-capabilities
curl -I http://localhost:3000/admin/ai-jobs
```

Expected: each route returns `200` or the existing development auth fallback response documented for admin routes.

- [ ] **Step 4: Write verification report**

Create `docs/superpowers/verification/2026-05-29-user-agent-runtime-verification.md` with commands, pass/fail results, and any environment limitations such as missing `DATABASE_URL`.

- [ ] **Step 5: Check off OpenSpec tasks**

Update `openspec/changes/add-user-agent-runtime/tasks.md` from `- [ ]` to `- [x]` only for completed implementation groups.

- [ ] **Step 6: Commit**

```bash
git add openspec/changes/add-user-agent-runtime/tasks.md docs/superpowers/verification/2026-05-29-user-agent-runtime-verification.md
git commit -m "docs: verify user agent runtime"
```

## Self-Review

- Spec coverage: user submission, admin capability resolution, Pi adapter, events/artifacts, user history, admin maintenance, and public AI page integration are covered by Tasks 1-5.
- Placeholder scan: no unresolved `TBD`, `TODO`, or fill-in instructions remain.
- Type consistency: `AgentTaskType`, `AgentRunDto`, `PiAgentRuntime`, and capability snapshot names match across the design and plan.
