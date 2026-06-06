---
change: multimodal-generation-history-cache
design-doc: docs/superpowers/specs/2026-06-06-multimodal-generation-history-cache-design.md
base-ref: 07381ccb7f12b54778171e489e849cde80837b72
---

# Multimodal Generation History Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image/video generation tasks recoverable through run history, cache generated media temporarily server-side, and promote cached media to formal assets only after explicit user save.

**Architecture:** Reuse `agent_runs` and `agent_artifacts` as the durable run/history model. Add a focused temporary media cache service under `src/server/media`, extend run orchestration to cache generated outputs before durable completion, and extend save/media access APIs to promote or preview cached outputs with ownership checks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/PostgreSQL, Tencent COS media storage, Node test runner, existing user API client.

---

## File Map

- Create `src/server/media/generated-media-cache.ts`: cache generated image/video bytes from provider URL/data URL into temporary object storage and sign preview access.
- Create `src/server/media/generated-media-cache.test.ts`: pure/unit coverage with fake storage and fetch dependencies.
- Modify `src/server/media/cos-client.ts`: add minimal object copy/read/sign support only if needed by cache promotion.
- Modify `src/server/media/save-generated-media.ts`: prefer cached artifact promotion before provider URL fallback.
- Modify `src/server/media/save-generated-media.test.ts`: add cached promotion, duplicate save, expired cache, quota failure tests.
- Modify `src/server/repositories/agent-runs.ts`: add task-type filtered run listing and preserve cache metadata.
- Modify `src/server/repositories/agent-runs.test.ts`: add image/video list and metadata isolation tests.
- Modify `src/server/agent/types.ts`: add cached direct media/storage status types.
- Modify `src/server/agent/media-results.ts`: parse/create cached direct media payloads without leaking object keys.
- Modify `src/server/agent/run-service.ts`: inject/cache generated image/video artifacts before completion events.
- Modify `src/server/agent/run-service` tests if existing coverage is in provider-specific files; otherwise add focused tests near current service tests.
- Modify `src/app/api/agent/runs/route.ts`: parse optional `taskType` query for listing.
- Create `src/app/api/agent/runs/[runId]/artifacts/[artifactId]/access/route.ts`: signed access route for cached or saved artifacts.
- Modify `src/app/api/agent/runs/route.test.ts`: task filter and validation tests.
- Modify `src/app/api/user/media-assets/route.test.ts`: cached promotion route tests where practical.
- Modify `src/features/public/agent-runtime-client.ts`: add task-filtered list calls, artifact access call, cached media parsing.
- Modify `src/features/public/agent-runtime-client.test.ts`: parser tests.
- Modify `src/app/image-gen/page.tsx`: add image run history/detail state and cached/saved result rendering.
- Modify `src/app/video-gen/page.tsx`: add video run history/detail state and cached/saved result rendering.
- Modify `openspec/changes/multimodal-generation-history-cache/tasks.md`: check off completed implementation tasks.

## Task 1: Repository History Filtering And Metadata Contract

**Files:**
- Modify: `src/server/agent/types.ts`
- Modify: `src/server/repositories/agent-runs.ts`
- Test: `src/server/repositories/agent-runs.test.ts`

- [ ] **Step 1: Add failing repository tests**

Add tests that create chat, image, and video runs for two users and assert task-filtered listing returns only matching owned runs. Add a metadata preservation assertion:

```ts
test('memory agent run repository filters runs by task type for user history', async () => {
  const repo = createMemoryAgentRunRepository();
  await createChatRun(repo);
  await repo.createRun({
    userId: 'user-alice',
    taskType: 'image',
    prompt: '山水图',
    provider: 'doubao',
    model: 'seedream',
    capabilitySnapshot: { bundleId: 'image', bundleCode: 'image', provider: 'doubao', model: 'seedream', capabilities: [] },
    input: { mode: 'generate' },
  });
  await repo.createRun({
    userId: 'user-bob',
    taskType: 'image',
    prompt: 'Bob image',
    provider: 'doubao',
    model: 'seedream',
    capabilitySnapshot: { bundleId: 'image', bundleCode: 'image', provider: 'doubao', model: 'seedream', capabilities: [] },
    input: { mode: 'generate' },
  });

  const imageRuns = await repo.listRunsForUser('user-alice', { taskType: 'image' });

  assert.equal(imageRuns.length, 1);
  assert.equal(imageRuns[0]?.taskType, 'image');
  assert.equal(imageRuns[0]?.prompt, '山水图');
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm exec tsx --test src/server/repositories/agent-runs.test.ts`

Expected: TypeScript failure because `listRunsForUser` does not accept a filter argument.

- [ ] **Step 3: Extend repository type and memory implementation**

Update `AgentRunRepository`:

```ts
export type ListAgentRunsForUserOptions = {
  taskType?: AgentTaskType;
};

listRunsForUser(userId: string, options?: ListAgentRunsForUserOptions): Promise<AgentRunDto[]>;
```

In memory implementation, filter before sorting/returning:

```ts
const visibleRuns = [...runs.values()].filter((run) =>
  run.userId === userId &&
  !run.deletedAt &&
  (!options?.taskType || run.taskType === options.taskType)
);
```

- [ ] **Step 4: Extend database implementation**

Build Drizzle conditions with optional task type:

```ts
const conditions = [
  eq(schema.agentRuns.userId, userId),
  isNull(schema.agentRuns.deletedAt),
];
if (options?.taskType) {
  conditions.push(eq(schema.agentRuns.taskType, options.taskType));
}
```

Use `and(...conditions)` in `listRunsForUser`.

- [ ] **Step 5: Add cached metadata type**

In `src/server/agent/types.ts`, extend storage status:

```ts
export type DirectMediaStorageStatus = 'provider_direct' | 'cached' | 'stored';
```

Do not expose object keys in DTO types.

- [ ] **Step 6: Verify**

Run: `pnpm exec tsx --test src/server/repositories/agent-runs.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/agent/types.ts src/server/repositories/agent-runs.ts src/server/repositories/agent-runs.test.ts
git commit -m "feat: filter multimodal agent run history"
```

## Task 2: Temporary Generated Media Cache Service

**Files:**
- Create: `src/server/media/generated-media-cache.ts`
- Test: `src/server/media/generated-media-cache.test.ts`
- Modify: `src/server/media/cos-client.ts` only if needed for signing/copy helpers

- [ ] **Step 1: Write failing cache service tests**

Create tests with fake dependencies:

```ts
test('cache service stores provider URL media in temporary object storage', async () => {
  const uploads: Array<{ objectKey: string; contentType: string; body: Uint8Array }> = [];
  const service = createGeneratedMediaCacheService({
    cosClient: {
      uploadObject: async (input) => {
        uploads.push(input);
        return { bucket: 'bucket', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      createSignedReadUrl: async (objectKey) => `https://signed.example/${objectKey}`,
    },
    fetchSource: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      byteSize: 3,
      width: 100,
      height: 80,
      durationSeconds: null,
    }),
    now: () => new Date('2026-06-06T00:00:00.000Z'),
    retentionMs: 7 * 24 * 60 * 60 * 1000,
  });

  const cached = await service.cacheGeneratedMedia({
    userId: 'user-1',
    runId: 'run-1',
    artifactId: 'artifact-1',
    kind: 'image',
    title: 'Generated image',
    sourceUrl: 'https://provider.example/image.png',
  });

  assert.equal(cached.objectKey, 'ai-generated-cache/test/users/user-1/runs/run-1/artifact-1.png');
  assert.equal(cached.expiresAt, '2026-06-13T00:00:00.000Z');
  assert.equal(uploads.length, 1);
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm exec tsx --test src/server/media/generated-media-cache.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement cache service**

Implement:

```ts
export type CacheGeneratedMediaInput = {
  userId: string;
  runId: string;
  artifactId: string;
  kind: 'image' | 'video';
  title: string;
  sourceUrl?: string;
  dataUrl?: string;
  mimeType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
};

export function createGeneratedMediaCacheService(dependencies: GeneratedMediaCacheDependencies) {
  return {
    async cacheGeneratedMedia(input: CacheGeneratedMediaInput): Promise<CachedGeneratedMedia> {
      const downloaded = input.dataUrl
        ? decodeDataUrl(input.dataUrl, input.mimeType)
        : await dependencies.fetchSource(requireSourceUrl(input.sourceUrl));
      const objectKey = createCacheObjectKey({ ...input, mimeType: downloaded.mimeType });
      const uploaded = await dependencies.cosClient.uploadObject({
        objectKey,
        body: downloaded.bytes,
        contentType: downloaded.mimeType,
      });
      return {
        storageProvider: 'tencent_cos',
        bucket: uploaded.bucket,
        region: uploaded.region,
        objectKey: uploaded.objectKey,
        mimeType: downloaded.mimeType,
        byteSize: downloaded.byteSize,
        width: downloaded.width,
        height: downloaded.height,
        durationSeconds: downloaded.durationSeconds,
        expiresAt: new Date(dependencies.now().getTime() + dependencies.retentionMs).toISOString(),
        metadata: structuredClone(input.metadata ?? {}),
      };
    },
    async createPreviewAccess(input: { objectKey: string; expiresInSeconds?: number }) {
      return {
        url: await dependencies.cosClient.createSignedReadUrl(input.objectKey, input.expiresInSeconds ?? 600),
        expiresAt: new Date(dependencies.now().getTime() + (input.expiresInSeconds ?? 600) * 1000).toISOString(),
      };
    },
  };
}
```

- [ ] **Step 4: Add data URL decoding and extension helpers**

Support `image/png`, `image/jpeg`, `image/webp`, `video/mp4`; reject unsupported or malformed data URLs with stable errors.

- [ ] **Step 5: Wire default factory**

Export `createDefaultGeneratedMediaCacheService()` that uses `createTencentCosClient()` and a local `fetchSource` equivalent to `save-generated-media`.

- [ ] **Step 6: Verify**

Run: `pnpm exec tsx --test src/server/media/generated-media-cache.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/media/generated-media-cache.ts src/server/media/generated-media-cache.test.ts src/server/media/cos-client.ts
git commit -m "feat: add temporary generated media cache"
```

## Task 3: Runtime Caches Image And Video Outputs

**Files:**
- Modify: `src/server/agent/media-results.ts`
- Modify: `src/server/agent/run-service.ts`
- Test: relevant existing run-service tests or new focused test file

- [ ] **Step 1: Add tests for cached artifact metadata**

Add service tests that inject a fake cache service and assert completed artifacts contain:

```ts
{
  storageStatus: 'cached',
  cacheStatus: 'available',
  cacheObjectKey: 'cache/object.png',
  cacheExpiresAt: '2026-06-13T00:00:00.000Z',
  saveStatus: 'not_saved',
  mimeType: 'image/png'
}
```

- [ ] **Step 2: Run failing tests**

Run the focused run-service test command for the new/modified test file.

Expected: FAIL because run service does not accept or call cache service.

- [ ] **Step 3: Add cache dependency to run service**

Extend `CreateAgentRunServiceInput`:

```ts
generatedMediaCache?: {
  cacheGeneratedMedia(input: CacheGeneratedMediaInput): Promise<CachedGeneratedMedia>;
};
```

Default to `createDefaultGeneratedMediaCacheService()`.

- [ ] **Step 4: Convert provider artifacts to cached durable artifacts**

Add helper:

```ts
async function cacheDirectMediaArtifact(input: {
  cache: GeneratedMediaCache;
  userId: string;
  runId: string;
  artifactId: string;
  artifact: AgentArtifactInput;
}): Promise<AgentArtifactInput> {
  const direct = toDirectMediaResult(input.artifact);
  if (!direct) return sanitizeDirectMediaArtifact(input.artifact);
  const cached = await input.cache.cacheGeneratedMedia({
    userId: input.userId,
    runId: input.runId,
    artifactId: input.artifactId,
    kind: direct.kind,
    title: direct.title,
    sourceUrl: direct.delivery.mode === 'provider_url' ? direct.delivery.url : undefined,
    dataUrl: direct.delivery.mode === 'data_url' ? direct.delivery.url : undefined,
    mimeType: direct.metadata.mimeType,
    filename: direct.metadata.filename,
    metadata: direct.metadata,
  });
  return {
    kind: input.artifact.kind,
    title: input.artifact.title,
    body: null,
    url: null,
    metadata: {
      ...direct.metadata,
      storageStatus: 'cached',
      cacheStatus: 'available',
      cacheProvider: cached.storageProvider,
      cacheBucket: cached.bucket,
      cacheRegion: cached.region,
      cacheObjectKey: cached.objectKey,
      cacheExpiresAt: cached.expiresAt,
      saveStatus: 'not_saved',
      mimeType: cached.mimeType,
      byteLength: cached.byteSize,
      width: cached.width ?? direct.metadata.width,
      height: cached.height ?? direct.metadata.height,
      durationSeconds: cached.durationSeconds ?? direct.metadata.durationSeconds,
      sourceUrl: direct.delivery.url,
      providerExpiresAt: direct.delivery.expiresAt,
    },
  };
}
```

If repository-generated artifact ids are needed before cache object key construction, use a cache id generated in the helper and store it as `cacheId`; do not depend on DB artifact id until after insert.

- [ ] **Step 5: Update image completion**

In `runImageProviderOrchestration`, cache accepted artifacts before `completeRun`. If cache fails, fail the run with a visible cache error rather than durable success.

- [ ] **Step 6: Update video sync completion**

In `syncVideoAgentRunForUser`, cache the video artifact before `completeRun`.

- [ ] **Step 7: Preserve SSE behavior**

For connected clients, stream direct/cached result payloads. Do not include object keys. Include `artifactId` after completion as today.

- [ ] **Step 8: Verify**

Run focused run-service tests and `pnpm exec tsx --test src/server/agent/media-provider-adapters.test.ts src/server/ai/image-provider-adapters.test.ts` if touched.

- [ ] **Step 9: Commit**

```bash
git add src/server/agent/run-service.ts src/server/agent/media-results.ts src/server/agent/*.test.ts
git commit -m "feat: cache generated media during run completion"
```

## Task 4: Cached Preview Access API

**Files:**
- Create: `src/app/api/agent/runs/[runId]/artifacts/[artifactId]/access/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts` or create colocated route test
- Modify: `src/features/public/agent-runtime-client.ts`

- [ ] **Step 1: Add route helper tests**

Extract route parsing helpers if necessary and test:

```ts
assert.equal(parseArtifactAccessDisposition('download'), 'download');
assert.equal(parseArtifactAccessDisposition(null), 'preview');
assert.throws(() => parseArtifactAccessDisposition('inline'), /Invalid disposition/);
```

- [ ] **Step 2: Implement access route**

Route behavior:

```ts
export async function GET(request: Request, context: RouteContext) {
  const session = await requireActiveAccount();
  const { runId, artifactId } = await context.params;
  const detail = await getAgentRunRepository().getRunDetailForUser(runId, session.user.id);
  if (!detail) return NextResponse.json({ error: { code: 'run_not_found', message: 'Agent run was not found.' } }, { status: 404 });
  const artifact = detail.run.artifacts.find((item) => item.id === artifactId);
  if (!artifact || (artifact.kind !== 'image' && artifact.kind !== 'video')) {
    return NextResponse.json({ error: { code: 'artifact_not_found', message: 'Generated media artifact was not found.' } }, { status: 404 });
  }
  // savedAssetId delegates to formal media access in a later step if needed.
  // cached artifact signs cache object only if cacheStatus is available and not expired.
}
```

- [ ] **Step 3: Use cache service for signed access**

Read `cacheObjectKey`, `cacheExpiresAt`, `mimeType`; reject expired cache:

```ts
if (cacheExpiresAt && new Date(cacheExpiresAt).getTime() <= Date.now()) {
  return NextResponse.json({ error: { code: 'cache_expired', message: 'Temporary generated media has expired.' } }, { status: 410 });
}
```

- [ ] **Step 4: Add client function**

In `agent-runtime-client.ts`:

```ts
export async function getGeneratedRunArtifactAccess(runId: string, artifactId: string, disposition: 'preview' | 'download' = 'preview') {
  const response = await userApiRequest(`/api/agent/runs/${runId}/artifacts/${artifactId}/access?disposition=${disposition}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw apiErrorFromPayload(payload, response.status, '生成结果访问失败');
  return payload.access as { url: string; expiresAt: string; mimeType: string | null; disposition: 'preview' | 'download' };
}
```

- [ ] **Step 5: Verify**

Run relevant route/client parser tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/runs src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: add generated artifact access route"
```

## Task 5: Save Service Promotes Cached Artifacts

**Files:**
- Modify: `src/server/media/save-generated-media.ts`
- Modify: `src/server/media/save-generated-media.test.ts`

- [ ] **Step 1: Add failing save tests**

Add a test where artifact metadata has `storageStatus: 'cached'`, `cacheObjectKey`, `mimeType`, `byteLength`, width/height, and save service creates a formal asset without calling provider `fetchSource`.

- [ ] **Step 2: Run failing tests**

Run: `pnpm exec tsx --test src/server/media/save-generated-media.test.ts`

Expected: FAIL because service only reads `sourceUrl`.

- [ ] **Step 3: Extend dependencies**

Add cache promotion dependency:

```ts
promoteCachedObject(input: {
  sourceObjectKey: string;
  targetObjectKey: string;
  contentType: string;
}): Promise<CosUploadResult>;
```

Default implementation can copy object in COS if supported, or read/reupload through storage helper. Keep tests dependency-injected.

- [ ] **Step 4: Implement cached path before provider URL fallback**

If metadata indicates cached and available:

```ts
const cacheObjectKey = readString(metadata, 'cacheObjectKey');
const cacheExpiresAt = readString(metadata, 'cacheExpiresAt');
if (cacheObjectKey && cacheExpiresAt && new Date(cacheExpiresAt).getTime() > Date.now()) {
  await updateArtifactSaveState(... saving ...);
  const uploaded = await dependencies.promoteCachedObject({ sourceObjectKey: cacheObjectKey, targetObjectKey: objectKey, contentType: mimeType });
  // createSavedAsset using cached metadata
}
```

- [ ] **Step 5: Preserve idempotency**

Keep existing `findSavedAssetBySource(input)` check as the first operation.

- [ ] **Step 6: Handle expired cache**

If cache expired and no `sourceUrl` fallback exists, update artifact metadata with:

```ts
{ saveStatus: 'source_expired', saveError: 'cache_expired' }
```

Throw a user-facing error.

- [ ] **Step 7: Verify**

Run: `pnpm exec tsx --test src/server/media/save-generated-media.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/media/save-generated-media.ts src/server/media/save-generated-media.test.ts
git commit -m "feat: promote cached generated media on save"
```

## Task 6: API List Filtering And Client Parsing

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Add route parser tests**

Add:

```ts
assert.equal(parseAgentRunTaskTypeFilter('image'), 'image');
assert.equal(parseAgentRunTaskTypeFilter('video'), 'video');
assert.equal(parseAgentRunTaskTypeFilter(null), undefined);
assert.throws(() => parseAgentRunTaskTypeFilter('bad'), /Invalid taskType/);
```

- [ ] **Step 2: Implement parser and GET filtering**

In `GET(request: Request)` read `new URL(request.url).searchParams.get('taskType')` and pass the optional filter to repository.

- [ ] **Step 3: Add client list helper**

```ts
export async function listAgentRuns(input: { taskType?: AgentTaskType } = {}): Promise<AgentRunDto[]> {
  const query = input.taskType ? `?taskType=${encodeURIComponent(input.taskType)}` : '';
  const response = await userApiRequest(`/api/agent/runs${query}`, { method: 'GET', cache: 'no-store' });
  ...
}
```

- [ ] **Step 4: Extend direct media parser**

Allow `metadata.storageStatus === 'cached' || 'stored' || 'provider_direct'`. Ensure malformed payloads still return null.

- [ ] **Step 5: Verify**

Run: `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/runs/route.ts src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: expose filtered multimodal run history API"
```

## Task 7: Image Generation History UI

**Files:**
- Modify: `src/app/image-gen/page.tsx`

- [ ] **Step 1: Add local UI state**

Add state:

```ts
const [historyRuns, setHistoryRuns] = useState<AgentRunDto[]>([]);
const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
const [historyLoading, setHistoryLoading] = useState(false);
const [artifactAccessById, setArtifactAccessById] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Load image history**

After auth/model readiness, call:

```ts
const runs = await listAgentRuns({ taskType: 'image' });
setHistoryRuns(runs);
```

Use cancellation guard like existing effects.

- [ ] **Step 3: Update submit success copy**

After `createAgentRun`, insert returned run into history and set:

```ts
setGenerationMessage('任务已在后台运行，你可以稍后回来查看结果。');
```

- [ ] **Step 4: Add history panel component inside file**

Implement a small local component:

```tsx
function GenerationHistoryPanel({ runs, selectedRunId, onSelect }: { runs: AgentRunDto[]; selectedRunId: string | null; onSelect(run: AgentRunDto): void }) {
  return <div className="rounded-2xl border border-border bg-card p-4">...</div>;
}
```

Rows show status, prompt, created time, `selectedModel?.name`, and saved/cache label from first image artifact metadata.

- [ ] **Step 5: Render selected run result**

When a completed selected run has image artifact:

- If artifact metadata `savedAssetId` exists, mark saved.
- If `storageStatus: cached`, request preview access through `getGeneratedRunArtifactAccess`.
- If failed/expired, show explanatory text.

- [ ] **Step 6: Reuse prompt/options**

Add a "复用提示词" button that copies selected run `prompt` into the active prompt textarea. For mode, read `run.input.mode` only if available through detail; if not exposed in list DTO, load detail before prefill.

- [ ] **Step 7: Verify manually with typecheck**

Run: `pnpm ts-check`

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/image-gen/page.tsx
git commit -m "feat: add image generation history UI"
```

## Task 8: Video Generation History UI

**Files:**
- Modify: `src/app/video-gen/page.tsx`

- [ ] **Step 1: Add video history state**

Mirror image history state with `listAgentRuns({ taskType: 'video' })`.

- [ ] **Step 2: Insert submitted run**

After video run creation, insert/update returned run in history and show:

```ts
setGenerationMessage('任务已在后台运行，你可以稍后回来查看结果。');
```

- [ ] **Step 3: Add running sync action**

For running video runs, provide "刷新状态" that calls `syncAgentRun(run.id)` and updates history.

- [ ] **Step 4: Render cached/saved preview**

Use `getGeneratedRunArtifactAccess` for cached video artifacts and existing save logic for "存储媒体".

- [ ] **Step 5: Reuse prompt**

Add "复用提示词" to set `prompt` from the selected run. Reusing old materials should only happen if material asset ids still exist in current saved asset lists; otherwise only reuse text parameters.

- [ ] **Step 6: Verify**

Run: `pnpm ts-check`

Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/video-gen/page.tsx
git commit -m "feat: add video generation history UI"
```

## Task 9: OpenSpec Tasks And Full Verification

**Files:**
- Modify: `openspec/changes/multimodal-generation-history-cache/tasks.md`
- Possibly create: `docs/superpowers/verification/2026-06-06-multimodal-generation-history-cache.md`

- [ ] **Step 1: Check off completed OpenSpec tasks**

Update `openspec/changes/multimodal-generation-history-cache/tasks.md` to mark completed tasks.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-runs.test.ts
pnpm exec tsx --test src/server/media/generated-media-cache.test.ts src/server/media/save-generated-media.test.ts
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.test.ts
```

- [ ] **Step 3: Run validation**

Run: `pnpm validate`

- [ ] **Step 4: Run build**

Run: `pnpm build`

- [ ] **Step 5: Run browser verification**

If local auth/database are available:

```bash
pnpm dev
```

Verify `/image-gen` and `/video-gen`:

- submit shows background-running copy;
- run appears in history;
- completed cached output can be previewed after refresh;
- save changes state to saved;
- failed/expired state is visible.

If blocked, write exact blocker in verification note.

- [ ] **Step 6: Commit verification and tasks**

```bash
git add openspec/changes/multimodal-generation-history-cache/tasks.md docs/superpowers/verification
git commit -m "docs: verify multimodal generation history cache"
```

## Plan Self-Review

Spec coverage:

- User run history: Tasks 1, 6, 7, 8.
- Temporary generated media cache: Tasks 2, 3, 4.
- Explicit generated media save: Task 5.
- Asynchronous submission UX: Tasks 7, 8.
- Public product history UI: Tasks 7, 8.
- Verification: Task 9.

No placeholder sections remain. Type names introduced in earlier tasks are reused consistently in later tasks.
