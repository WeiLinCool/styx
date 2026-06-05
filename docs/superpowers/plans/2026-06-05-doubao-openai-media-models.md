# Doubao And OpenAI-Compatible Media Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support real Doubao Seedream image models and Seedance video models while separating chat primary models from media models and introducing an extensible OpenAI-compatible media routing boundary.

**Architecture:** Extend `ai_models` with an explicit execution protocol, enforce capability/protocol validation in admin and repository layers, and route image/video execution through protocol-based media adapters. Keep chat orchestration separate, refactor image execution onto the new media boundary, and add a video task create/query flow that the existing `/video-gen` surface can poll through the server.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Drizzle ORM, existing server repositories under `src/server`, existing admin feature UI under `src/features/admin`.

---

## File Structure Map

### Schema and persistence

- Modify: `src/server/db/schema.ts`
  - Add `executionProtocol` to `aiModels`.
- Modify: `src/server/db/seed.ts`
  - Seed development/chat/image/video records with explicit protocols.
- Create: `drizzle/00xx_<generated>.sql`
  - Generated migration for `execution_protocol`.
- Create: `drizzle/meta/00xx_snapshot.json`
  - Generated Drizzle snapshot for the migration.

### AI model repository and validation

- Modify: `src/server/repositories/ai-models.ts`
  - Add protocol types, row mapping, repository validation, task-type resolution gates, and admin test branching.
- Modify: `src/server/repositories/ai-models.test.ts`
  - Cover protocol-aware resolution and admin validation failures.

### Admin API and forms

- Modify: `src/app/api/admin/ai-models/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/route.ts`
  - Accept `executionProtocol` at the boundary.
- Modify: `src/app/api/admin/ai-models/route.test.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/route.test.ts`
  - Validate missing/invalid protocol combinations.
- Modify: `src/features/admin/admin-ai-config-forms.tsx`
  - Add protocol field and capability-aware validation messaging.
- Modify: `src/features/admin/admin-ai-models-module.tsx`
  - Display protocol and clearer chat/image/video defaults.

### Media adapter layer

- Create: `src/server/ai/media-provider-adapters.ts`
  - Shared protocol-oriented media adapter interfaces and factory.
- Modify: `src/server/ai/image-provider-adapters.ts`
  - Reuse shared image/media shapes or delegate to the protocol adapter.
- Create: `src/server/ai/video-provider-adapters.ts`
  - Doubao Seedance task create/query implementation.
- Create: `src/server/ai/media-provider-adapters.test.ts`
  - Adapter factory and protocol routing tests.
- Modify: `src/server/ai/image-provider-adapters.test.ts`
  - Align with shared protocol contracts.

### User APIs and run orchestration

- Modify: `src/app/api/agent/runs/route.ts`
  - Validate video input and task-type/model constraints.
- Modify: `src/server/agent/run-service.ts`
  - Add protocol-based media execution and video task lifecycle.
- Modify: `src/server/agent/run-service.test.ts`
  - Cover video create/query, task mismatch rejection, and no-debit failure path.
- Modify: `src/app/api/agent/image-models/route.ts`
  - Continue using filtered model list with protocol-aware repository filtering.
- Modify: `src/app/api/agent/video-models/route.ts`
  - Keep endpoint but rely on stricter repository filtering.
- Create: `src/app/api/agent/runs/[runId]/sync/route.ts`
  - Trigger bounded video status sync.
- Create: `src/app/api/agent/runs/[runId]/sync/route.test.ts`
  - Cover running/succeeded/failed sync responses.

### Frontend runtime clients

- Modify: `src/features/public/agent-runtime-client.ts`
  - Add sync polling hook for video runs if the current client does not already expose one.
- Modify: `src/features/public/agent-runtime-client.test.ts`
  - Cover bounded sync/polling behavior.
- Modify: `src/app/video-gen/page.tsx` or the feature module it renders
  - Use real run polling instead of static behavior if still hardcoded.

## Task 1: Add execution protocol to schema and seed data

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Test: `src/server/db/schema.docs.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
test('ai models schema exposes execution protocol column', () => {
  assert.ok(schema.aiModels.executionProtocol);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/db/schema.docs.test.ts`
Expected: FAIL because `executionProtocol` does not exist on `schema.aiModels`.

- [ ] **Step 3: Add the schema column**

```ts
export const aiModelExecutionProtocol = pgEnum('ai_model_execution_protocol', [
  'chat_openai_compatible',
  'image_openai_compatible',
  'video_task_polling',
]);

export const aiModels = pgTable('ai_models', {
  // existing columns...
  executionProtocol: aiModelExecutionProtocol('execution_protocol')
    .notNull()
    .default('chat_openai_compatible'),
});
```

- [ ] **Step 4: Update seed records with explicit protocols**

```ts
{
  code: 'dev-free-chat',
  executionProtocol: 'chat_openai_compatible',
}

{
  code: 'dev-free-image',
  executionProtocol: 'image_openai_compatible',
}

{
  code: 'dev-free-video',
  executionProtocol: 'video_task_polling',
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test src/server/db/schema.docs.test.ts`
Expected: PASS.

- [ ] **Step 6: Generate the migration**

Run: `pnpm db:generate`
Expected: PASS and new files appear under `drizzle/` and `drizzle/meta/`.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts src/server/db/seed.ts drizzle drizzle/meta src/server/db/schema.docs.test.ts
git commit -m "feat: add ai model execution protocol"
```

## Task 2: Make repository resolution protocol-aware and fail closed

**Files:**
- Modify: `src/server/repositories/ai-models.ts`
- Test: `src/server/repositories/ai-models.test.ts`

- [ ] **Step 1: Write the failing repository tests**

```ts
test('resolve chat model rejects image execution protocol', async () => {
  await assert.rejects(
    () => resolveDatabaseChatModelForUserFromRows([buildRow({
      supportsChat: true,
      executionProtocol: 'image_openai_compatible',
    })], 'model-1', []),
    /Model is not available/,
  );
});

test('list image models excludes chat protocol rows', () => {
  const models = listDatabaseImageModelsForUserFromRows([
    buildRow({
      supportsImageGeneration: true,
      executionProtocol: 'chat_openai_compatible',
    }),
  ], [], 'generate');

  assert.deepEqual(models, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/server/repositories/ai-models.test.ts`
Expected: FAIL because protocol is not part of row filtering/resolution.

- [ ] **Step 3: Introduce protocol types and resolved model fields**

```ts
export type AiModelExecutionProtocol =
  | 'chat_openai_compatible'
  | 'image_openai_compatible'
  | 'video_task_polling';

export type ResolvedChatModel = PublicChatModelDto & {
  executionProtocol: AiModelExecutionProtocol;
  // existing fields...
};
```

- [ ] **Step 4: Enforce task-type protocol gates in row grouping and resolvers**

```ts
function supportsChatProtocol(protocol: AiModelExecutionProtocol) {
  return protocol === 'chat_openai_compatible';
}

function supportsImageProtocol(protocol: AiModelExecutionProtocol) {
  return protocol === 'image_openai_compatible';
}

function supportsVideoProtocol(protocol: AiModelExecutionProtocol) {
  return protocol === 'video_task_polling';
}
```

Apply these guards in:

- chat resolver paths
- image model list/resolution paths
- video model list/resolution paths
- admin row mapping

- [ ] **Step 5: Add repository-side admin mutation validation**

```ts
function validateModelCapabilityProtocol(input: {
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
  executionProtocol: AiModelExecutionProtocol;
}) {
  if (input.supportsChat && !supportsChatProtocol(input.executionProtocol)) {
    throw new Error('Chat-capable models must use a chat execution protocol.');
  }

  if (
    (input.supportsImageGeneration || input.supportsImageEdit || input.supportsImageUpscale) &&
    !supportsImageProtocol(input.executionProtocol)
  ) {
    throw new Error('Image-capable models must use an image execution protocol.');
  }

  if (input.supportsVideoGeneration && !supportsVideoProtocol(input.executionProtocol)) {
    throw new Error('Video-capable models must use a video execution protocol.');
  }
}
```

- [ ] **Step 6: Run repository tests**

Run: `pnpm exec tsx --test src/server/repositories/ai-models.test.ts`
Expected: PASS with protocol-aware filtering and validation.

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories/ai-models.ts src/server/repositories/ai-models.test.ts
git commit -m "feat: enforce protocol-aware ai model resolution"
```

## Task 3: Accept execution protocol in admin API boundaries

**Files:**
- Modify: `src/app/api/admin/ai-models/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/route.ts`
- Test: `src/app/api/admin/ai-models/route.test.ts`
- Test: `src/app/api/admin/ai-models/[modelId]/route.test.ts`

- [ ] **Step 1: Write the failing API boundary tests**

```ts
test('create ai model route requires executionProtocol', () => {
  const body = { ...validBody };
  delete body.executionProtocol;

  assert.throws(() => parseCreateAiModelBody(body), /executionProtocol/);
});

test('update ai model route rejects invalid image protocol combination', () => {
  assert.throws(
    () =>
      parseUpdateAiModelBody({
        ...validBody,
        supportsImageGeneration: true,
        executionProtocol: 'chat_openai_compatible',
      }),
    /execution protocol/,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/app/api/admin/ai-models/route.test.ts src/app/api/admin/ai-models/[modelId]/route.test.ts`
Expected: FAIL because the schema does not include `executionProtocol`.

- [ ] **Step 3: Add `executionProtocol` to the route schemas**

```ts
const executionProtocolSchema = z.enum([
  'chat_openai_compatible',
  'image_openai_compatible',
  'video_task_polling',
]);

const bodySchema = z.object({
  // existing fields...
  executionProtocol: executionProtocolSchema,
});
```

- [ ] **Step 4: Reuse repository validation or mirror boundary-safe checks**

```ts
.superRefine((body, context) => {
  if (body.supportsVideoGeneration && body.executionProtocol !== 'video_task_polling') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionProtocol'],
      message: 'Video-capable models must use a video execution protocol.',
    });
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec tsx --test src/app/api/admin/ai-models/route.test.ts src/app/api/admin/ai-models/[modelId]/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/ai-models/route.ts src/app/api/admin/ai-models/[modelId]/route.ts src/app/api/admin/ai-models/route.test.ts src/app/api/admin/ai-models/[modelId]/route.test.ts
git commit -m "feat: add ai model execution protocol api validation"
```

## Task 4: Update admin forms and list UI for protocol-aware configuration

**Files:**
- Modify: `src/features/admin/admin-ai-config-forms.tsx`
- Modify: `src/features/admin/admin-ai-models-module.tsx`

- [ ] **Step 1: Add a focused form test or server-render snapshot**

```ts
test('admin ai config form renders execution protocol field', () => {
  const html = renderToStaticMarkup(<EditAiModelDialog model={model} providers={providers} compact />);
  assert.match(html, /executionProtocol/);
});
```

- [ ] **Step 2: Run the relevant test to verify it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-ai-config-forms.test.ts`
Expected: FAIL because the protocol field is missing.

- [ ] **Step 3: Add protocol form state and select input**

```tsx
<Controller
  control={form.control}
  name="executionProtocol"
  render={({ field }) => (
    <Select value={field.value} onValueChange={field.onChange}>
      <SelectItem value="chat_openai_compatible">Chat / OpenAI-compatible</SelectItem>
      <SelectItem value="image_openai_compatible">Image / OpenAI-compatible</SelectItem>
      <SelectItem value="video_task_polling">Video / Task polling</SelectItem>
    </Select>
  )}
/>
```

- [ ] **Step 4: Add client-side guardrails that mirror the server**

```ts
const executionProtocol = form.watch('executionProtocol');

const protocolWarnings = getExecutionProtocolWarnings({
  executionProtocol,
  supportsChat: form.watch('supportsChat'),
  supportsImageGeneration: form.watch('supportsImageGeneration'),
  supportsImageEdit: form.watch('supportsImageEdit'),
  supportsImageUpscale: form.watch('supportsImageUpscale'),
  supportsVideoGeneration: form.watch('supportsVideoGeneration'),
});
```

- [ ] **Step 5: Surface protocol in the admin list**

```tsx
<StatusBadge value={formatAdminAiLabel(model.executionProtocol)} />
```

- [ ] **Step 6: Run form/module tests**

Run: `pnpm exec tsx --test src/features/admin/admin-ai-config-forms.test.ts src/features/admin/admin-ai-models-module.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/admin-ai-config-forms.tsx src/features/admin/admin-ai-models-module.tsx src/features/admin/admin-ai-config-forms.test.ts src/features/admin/admin-ai-models-module.test.tsx
git commit -m "feat: expose execution protocol in admin ai config"
```

## Task 5: Introduce protocol-based media adapter interfaces

**Files:**
- Create: `src/server/ai/media-provider-adapters.ts`
- Modify: `src/server/ai/image-provider-adapters.ts`
- Create: `src/server/ai/media-provider-adapters.test.ts`
- Modify: `src/server/ai/image-provider-adapters.test.ts`

- [ ] **Step 1: Write the failing adapter factory tests**

```ts
test('create media provider adapter returns image adapter for image_openai_compatible', () => {
  const adapter = createMediaProviderAdapter(buildResolvedImageModel({
    executionProtocol: 'image_openai_compatible',
  }));

  assert.equal(adapter.protocol, 'image_openai_compatible');
  assert.equal(typeof adapter.createImage, 'function');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/server/ai/media-provider-adapters.test.ts src/server/ai/image-provider-adapters.test.ts`
Expected: FAIL because `createMediaProviderAdapter` does not exist.

- [ ] **Step 3: Create shared media types and factory**

```ts
export type MediaExecutionProtocol =
  | 'image_openai_compatible'
  | 'video_task_polling';

export type MediaProviderAdapter = {
  protocol: MediaExecutionProtocol;
  createImage?: (request: ImageProviderRequest) => Promise<ImageProviderResult>;
  createVideoTask?: (request: VideoProviderCreateRequest) => Promise<VideoTaskCreatedResult>;
  getVideoTask?: (request: VideoProviderStatusRequest) => Promise<VideoTaskStatusResult>;
};
```

- [ ] **Step 4: Route image models through the new factory**

```ts
export function createMediaProviderAdapter(model: ResolvedImageModel | ResolvedVideoModel): MediaProviderAdapter {
  if (model.executionProtocol === 'image_openai_compatible') {
    return createOpenAiCompatibleImageMediaAdapter();
  }

  if (model.executionProtocol === 'video_task_polling') {
    return createDoubaoVideoTaskAdapter();
  }

  throw new ProviderConfigurationError(`Unsupported media execution protocol: ${model.executionProtocol}`);
}
```

- [ ] **Step 5: Keep image response parsing behavior unchanged**

Move or reuse existing parsing logic from `image-provider-adapters.ts` instead of rewriting response handling.

- [ ] **Step 6: Run adapter tests**

Run: `pnpm exec tsx --test src/server/ai/media-provider-adapters.test.ts src/server/ai/image-provider-adapters.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/ai/media-provider-adapters.ts src/server/ai/media-provider-adapters.test.ts src/server/ai/image-provider-adapters.ts src/server/ai/image-provider-adapters.test.ts
git commit -m "refactor: add protocol-based media adapter factory"
```

## Task 6: Implement Doubao Seedance video task adapter

**Files:**
- Create: `src/server/ai/video-provider-adapters.ts`
- Test: `src/server/ai/media-provider-adapters.test.ts`

- [ ] **Step 1: Write the failing Seedance adapter tests**

```ts
test('doubao video adapter creates a provider task id', async () => {
  const adapter = createDoubaoVideoTaskAdapter({ fetch: mockFetchSuccess(createTaskBody) });
  const result = await adapter.createVideoTask!(request);
  assert.equal(result.providerTaskId, 'task_123');
});

test('doubao video adapter parses succeeded task result', async () => {
  const adapter = createDoubaoVideoTaskAdapter({ fetch: mockFetchSuccess(queryTaskBody) });
  const result = await adapter.getVideoTask!(statusRequest);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.outputUrl, 'https://provider.example/video.mp4');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/server/ai/media-provider-adapters.test.ts`
Expected: FAIL because the video adapter does not exist.

- [ ] **Step 3: Implement task create/query functions**

```ts
export function createDoubaoVideoTaskAdapter(input: { fetch?: typeof fetch } = {}): MediaProviderAdapter {
  return {
    protocol: 'video_task_polling',
    async createVideoTask(request) {
      // POST provider task creation endpoint
    },
    async getVideoTask(request) {
      // GET/POST provider task status endpoint
    },
  };
}
```

- [ ] **Step 4: Normalize provider states**

```ts
function normalizeVideoTaskStatus(rawStatus: string): 'running' | 'succeeded' | 'failed' {
  if (rawStatus === 'succeeded' || rawStatus === 'done') return 'succeeded';
  if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'cancelled') return 'failed';
  return 'running';
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec tsx --test src/server/ai/media-provider-adapters.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/video-provider-adapters.ts src/server/ai/media-provider-adapters.test.ts
git commit -m "feat: add doubao seedance video task adapter"
```

## Task 7: Extend run-service for protocol-based image and video execution

**Files:**
- Modify: `src/server/agent/run-service.ts`
- Test: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write failing run-service tests for video task lifecycle**

```ts
test('video run stores provider task id and remains running after create', async () => {
  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: 'A cinematic clip',
    modelId: 'model-video-1',
    input: { duration: 5, resolution: '720p', ratio: '16:9' },
  });

  assert.equal(result.run.status, 'running');
  assert.equal(recordedCapabilitySnapshot.providerTaskId, 'task_123');
});

test('chat task rejects image protocol model id', async () => {
  await assert.rejects(
    () => service.createAndRunAgentRun({
      userId: 'user-1',
      taskType: 'chat',
      prompt: 'hello',
      modelId: 'model-image-1',
      input: {},
    }),
    /Model is not available/,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/server/agent/run-service.test.ts`
Expected: FAIL because video execution is not wired and protocol mismatch is not enforced end-to-end.

- [ ] **Step 3: Replace direct image adapter creation with media factory**

```ts
const adapter = createMediaProviderAdapter(model);

if (request.taskType === 'image') {
  const providerResult = await adapter.createImage!(imageRequest);
}
```

- [ ] **Step 4: Add `createAndRunVideoAgentRun`**

```ts
async function createAndRunVideoAgentRun(input: {
  input: CreateAndRunAgentRunInput;
  repository: AgentRunRepository;
  resolveVideoModelForUser: (...) => Promise<ResolvedVideoModel>;
  createMediaProviderAdapter: (...) => MediaProviderAdapter;
  debitForImageAgentRun: DebitForImageAgentRun;
}) {
  // resolve model
  // preflight
  // create run
  // create provider task
  // persist task metadata
  // return running run
}
```

- [ ] **Step 5: Add bounded sync entrypoint in the service**

```ts
async function syncVideoAgentRun(runId: string): Promise<AgentRunDto> {
  // load run
  // check running + provider task metadata
  // query adapter.getVideoTask
  // update running or complete/fail
}
```

- [ ] **Step 6: Reuse existing billing/debit conventions**

Use the same idempotent debit path and snapshot shape used by image runs, but store video provider task metadata and normalized usage in the capability snapshot.

- [ ] **Step 7: Run tests**

Run: `pnpm exec tsx --test src/server/agent/run-service.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: add protocol-based media run orchestration"
```

## Task 8: Add user video sync API and wire route validation

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Create: `src/app/api/agent/runs/[runId]/sync/route.ts`
- Create: `src/app/api/agent/runs/[runId]/sync/route.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
test('create agent run body requires modelId for video requests', () => {
  assert.throws(
    () => parseCreateAgentRunBody({
      taskType: 'video',
      prompt: 'A short clip',
      input: { duration: 5 },
    }),
    /modelId is required for video requests/,
  );
});

test('video sync route returns updated run payload', async () => {
  const response = await POST(new Request('https://example.com/api/agent/runs/run-1/sync'));
  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/app/api/agent/runs/[runId]/sync/route.test.ts`
Expected: FAIL because video validation and sync route are missing.

- [ ] **Step 3: Add video input validation in `runs` route**

```ts
if (body.taskType === 'video' && !body.modelId) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['modelId'],
    message: 'modelId is required for video requests.',
  });
}
```

Also validate the minimal bounded fields you actually support in this release, such as:

- `duration`
- `resolution`
- `ratio`
- `seed`
- `watermark`

- [ ] **Step 4: Add sync route**

```ts
export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const session = await requireActiveAccount();
  const { runId } = await context.params;
  const run = await createService().syncVideoAgentRunForUser(session.user.id, runId);
  return NextResponse.json({ run });
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/app/api/agent/runs/[runId]/sync/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/runs/route.ts src/app/api/agent/runs/[runId]/sync/route.ts src/app/api/agent/runs/[runId]/sync/route.test.ts
git commit -m "feat: add video run sync api"
```

## Task 9: Update frontend polling for real video runs

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`
- Modify: `src/app/video-gen/page.tsx` or the feature module that owns video-gen state

- [ ] **Step 1: Write the failing client test**

```ts
test('video polling triggers sync endpoint for running video runs', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ run: { id: 'run-1', status: 'running' } }));
  };

  await pollVideoRunUntilSettled('run-1');
  assert.ok(calls.some((value) => value.endsWith('/api/agent/runs/run-1/sync')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts`
Expected: FAIL because the client does not call the sync endpoint.

- [ ] **Step 3: Add a sync-aware polling helper**

```ts
export async function syncAgentRun(runId: string) {
  return fetchJson(`/api/agent/runs/${runId}/sync`, { method: 'POST' });
}
```

- [ ] **Step 4: Use the sync helper in the video page flow**

```ts
if (run.taskType === 'video' && run.status === 'running') {
  const next = await syncAgentRun(run.id);
  setRun(next.run);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts src/app/video-gen/page.tsx
git commit -m "feat: poll running video runs through sync endpoint"
```

## Task 10: Run focused verification and record results

**Files:**
- Create: `docs/superpowers/verification/2026-06-05-doubao-openai-media-models.md`

- [ ] **Step 1: Run focused unit and route tests**

Run:

```bash
pnpm exec tsx --test \
  src/server/db/schema.docs.test.ts \
  src/server/repositories/ai-models.test.ts \
  src/app/api/admin/ai-models/route.test.ts \
  src/app/api/admin/ai-models/[modelId]/route.test.ts \
  src/server/ai/media-provider-adapters.test.ts \
  src/server/ai/image-provider-adapters.test.ts \
  src/server/agent/run-service.test.ts \
  src/app/api/agent/runs/route.test.ts \
  src/app/api/agent/runs/[runId]/sync/route.test.ts \
  src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository validation baseline**

Run: `pnpm validate`
Expected: PASS. If existing unrelated failures remain, capture the exact failing files and distinguish them from this change.

- [ ] **Step 3: Run production build wiring check**

Run: `pnpm build`
Expected: PASS and routes include `/api/agent/image-models`, `/api/agent/video-models`, `/api/agent/runs`, and `/api/agent/runs/[runId]/sync`.

- [ ] **Step 4: Write the verification note**

```md
# Doubao And OpenAI-Compatible Media Models Verification

- Focused tests: PASS/FAIL
- `pnpm validate`: PASS/FAIL
- `pnpm build`: PASS/FAIL
- Browser verification: blocked/not run/run, with exact reason
- Residual risk: any provider credential or local environment blockers
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/verification/2026-06-05-doubao-openai-media-models.md
git commit -m "docs: record media model verification"
```

## Self-Review

Spec coverage:

- Execution protocol and fail-closed separation: Tasks 1-4.
- Doubao Seedream image support via reusable OpenAI-compatible path: Tasks 5 and 7.
- Doubao Seedance video create/query and sync flow: Tasks 6-9.
- Admin configuration and validation: Tasks 2-4.
- Future OpenAI-compatible media extensibility: Tasks 5 and 7.

Placeholder scan:

- No `TBD`, `TODO`, or deferred “implement later” language is left in task steps.

Type consistency:

- Protocol names are consistently:
  - `chat_openai_compatible`
  - `image_openai_compatible`
  - `video_task_polling`

