# Multimodal Media Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit user-controlled saving of generated image/video outputs into a COS-backed “我的媒体” library with per-user isolation, reusable asset references, storage quota accounting, and admin audit visibility without coupling generation success to storage success.

**Architecture:** Keep agent runs authoritative for generation, direct delivery, and billing. Add a separate durable media asset layer for explicit save actions, with save state bridged back into `agent_artifacts.metadata`. Use the existing S3-compatible AWS SDK to talk to Tencent COS through a focused server media service, and extend user/admin surfaces to show generation-vs-storage lifecycle separately.

**Tech Stack:** Next.js App Router, TypeScript, React 19, Drizzle ORM, PostgreSQL, AWS S3 SDK against Tencent COS, existing agent runtime and admin modules.

---

## File Structure

Planned file responsibilities before implementation:

- Modify `src/server/db/schema.ts`
  Add media asset/storage enums and tables, plus durable storage quota fields.
- Create `src/server/media/cos-client.ts`
  Wrap Tencent COS S3-compatible upload/delete/signed-read primitives.
- Create `src/server/media/save-generated-media.ts`
  Own save validation, provider fetch, COS upload, DB persistence, save-state transitions, and quota updates.
- Create `src/server/media/save-generated-media.test.ts`
  Cover save success, duplicate save, quota rejection, upload failure, and source-expired handling.
- Create `src/server/repositories/generated-media-assets.ts`
  Own user/admin saved-asset queries, inserts, soft delete, and idempotent lookup by `(userId, runId, artifactId)`.
- Create `src/server/repositories/generated-media-assets.test.ts`
  Cover repository persistence, filtering, soft delete, and duplicate protection.
- Modify `src/server/repositories/agent-runs.ts`
  Support artifact save metadata reads/writes and artifact lookup/update helpers.
- Modify `src/server/agent/types.ts`
  Extend DTOs for artifact save metadata and saved asset summaries.
- Modify `src/server/agent/media-results.ts`
  Preserve save-related metadata in sanitized/direct media payloads.
- Modify `src/app/api/agent/runs/route.ts` and relevant tests only if DTO shape changes require response updates.
- Create `src/app/api/user/media-assets/route.ts`
  Accept explicit save requests and list saved assets for the current user.
- Create `src/app/api/user/media-assets/[assetId]/route.ts`
  Return/delete a saved asset for the current user.
- Create `src/app/api/user/media-assets/reuse/route.ts`
  Return assets eligible for reuse or sign access URLs if needed by the UI.
- Create route tests under `src/app/api/user/media-assets/*.test.ts`
  Cover auth, validation, isolation, duplicate save, delete, and list flows.
- Modify `src/features/public/agent-runtime-client.ts`
  Add typed client helpers for save/list/delete media assets and parse artifact save metadata.
- Modify `src/app/image-gen/page.tsx`
  Show save state, save action, and “前往我的媒体” affordance.
- Modify `src/app/video-gen/page.tsx`
  Mirror image page save state/action for videos.
- Modify `src/app/user-center/page.tsx` and/or create `src/features/public/user-media-module.tsx`
  Add the “我的媒体” library UI in the user center surface.
- Create `src/features/public/user-media-module.test.tsx` if existing test style supports component coverage.
- Modify `src/server/repositories/ai-jobs.ts`
  Add generation/storage audit fields for admin views.
- Modify `src/features/admin/admin-ai-jobs-module.tsx`
  Render save state, saved asset presence, object key/storage bytes, and related audit detail.
- Add or update admin route tests / repository tests as needed for new audit fields.
- Create or update verification note under `docs/superpowers/verification/`
  Record commands, browser checks, and any COS-environment blockers.

## Task 1: Add Durable Storage Schema and Repository Coverage

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/repositories/agent-runs.ts`
- Create: `src/server/repositories/generated-media-assets.ts`
- Create: `src/server/repositories/generated-media-assets.test.ts`
- Modify: `src/server/repositories/agent-runs.test.ts`

- [ ] **Step 1: Write the failing repository tests for saved assets and artifact save metadata**

```ts
test('generated media asset repository creates and lists user-owned saved assets', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const created = await repository.createSavedAsset({
    userId: 'user-1',
    runId: 'run-1',
    conversationId: 'conversation-1',
    artifactId: 'artifact-1',
    kind: 'image',
    title: '封面图',
    sourceProvider: 'doubao',
    sourceModel: 'seedream-3',
    sourceUrl: 'https://provider.example/output.png',
    sourceExpiresAt: '2026-06-03T12:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-1.png',
    mimeType: 'image/png',
    byteSize: 1024,
    width: 512,
    height: 512,
    durationSeconds: null,
    metadata: {},
  });

  assert.equal(created.userId, 'user-1');
  const listed = await repository.listSavedAssetsForUser('user-1');
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);
});

test('agent run repository updates artifact save metadata without changing run status', async () => {
  const repository = createMemoryAgentRunRepository();
  const run = await repository.createRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'mountain',
    provider: 'doubao',
    model: 'seedream-3',
    capabilitySnapshot: { provider: 'doubao', model: 'seedream-3', capabilities: [] },
    input: {},
  });

  await repository.completeRun(run.id, {
    finalMessage: 'done',
    artifacts: [
      {
        kind: 'image',
        title: 'Result',
        metadata: { saveStatus: 'not_saved', providerExpiresAt: '2026-06-03T12:00:00.000Z' },
      },
    ],
  });

  const updated = await repository.updateArtifactSaveState(run.id, 0, {
    saveStatus: 'saved',
    savedAssetId: 'asset-1',
  });

  assert.equal(updated?.artifacts[0]?.metadata.saveStatus, 'saved');
  assert.equal(updated?.status, 'succeeded');
});
```

- [ ] **Step 2: Run the focused repository tests to verify they fail**

Run: `pnpm exec tsx --test src/server/repositories/generated-media-assets.test.ts src/server/repositories/agent-runs.test.ts`

Expected: FAIL with missing repository/module symbols such as `createMemoryGeneratedMediaAssetRepository` and `updateArtifactSaveState`.

- [ ] **Step 3: Add schema, repository contracts, and memory/database implementations**

```ts
export const generatedMediaAssetStatus = pgEnum('generated_media_asset_status', ['ready', 'deleted']);

export const generatedMediaAssets = pgTable(
  'generated_media_assets',
  {
    id,
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    kind: agentArtifactKind('kind').notNull(),
    title: text('title').notNull(),
    sourceProvider: text('source_provider').notNull(),
    sourceModel: text('source_model').notNull(),
    sourceUrl: text('source_url'),
    sourceExpiresAt: timestamp('source_expires_at', { withTimezone: true }),
    storageProvider: text('storage_provider').notNull().default('tencent_cos'),
    bucket: text('bucket').notNull(),
    region: text('region').notNull(),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }).$type<number | null>(),
    status: generatedMediaAssetStatus('status').notNull().default('ready'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    saveRequestedAt: timestamp('save_requested_at', { withTimezone: true }).notNull().defaultNow(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('generated_media_assets_user_id_idx').on(table.userId),
    index('generated_media_assets_run_id_idx').on(table.runId),
    index('generated_media_assets_conversation_id_idx').on(table.conversationId),
    index('generated_media_assets_artifact_id_idx').on(table.artifactId),
    uniqueIndex('generated_media_assets_object_key_unique_idx').on(table.objectKey),
  ],
);

export type GeneratedMediaAssetRepository = {
  createSavedAsset(input: CreateSavedAssetInput): Promise<GeneratedMediaAssetDto>;
  listSavedAssetsForUser(userId: string): Promise<GeneratedMediaAssetDto[]>;
  findSavedAssetBySource(input: { userId: string; runId: string; artifactId: string }): Promise<GeneratedMediaAssetDto | null>;
  getSavedAssetForUser(assetId: string, userId: string): Promise<GeneratedMediaAssetDto | null>;
  softDeleteSavedAssetForUser(assetId: string, userId: string): Promise<GeneratedMediaAssetDto | null>;
};
```

- [ ] **Step 4: Run the focused repository tests to verify they pass**

Run: `pnpm exec tsx --test src/server/repositories/generated-media-assets.test.ts src/server/repositories/agent-runs.test.ts`

Expected: PASS with repository persistence, filtering, and artifact save-metadata tests green.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/repositories/agent-runs.ts src/server/repositories/agent-runs.test.ts src/server/repositories/generated-media-assets.ts src/server/repositories/generated-media-assets.test.ts
git commit -m "feat: add generated media asset persistence"
```

## Task 2: Add Storage Quota Fields and Quota Owner Logic

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/repositories/users.ts` or the existing account/entitlement owner module discovered during implementation
- Modify: `src/server/repositories/users.test.ts` or add a focused storage-quota test file

- [ ] **Step 1: Write the failing quota tests**

```ts
test('storage quota owner rejects saves that exceed remaining bytes', async () => {
  const quota = createUserStorageQuota({
    storageQuotaBytes: 2_000,
    storageUsedBytes: 1_500,
  });

  assert.equal(quota.canAllocate(400), true);
  assert.equal(quota.canAllocate(600), false);
});

test('storage quota owner updates used bytes on save and delete', async () => {
  const repository = createMemoryUserStorageRepository();

  await repository.setStorageQuota('user-1', { storageQuotaBytes: 2_000, storageUsedBytes: 500 });
  await repository.incrementStorageUsedBytes('user-1', 300);
  await repository.incrementStorageUsedBytes('user-1', -200);

  const quota = await repository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 2_000, storageUsedBytes: 600 });
});
```

- [ ] **Step 2: Run the focused quota tests to verify they fail**

Run: `pnpm exec tsx --test src/server/repositories/users.test.ts`

Expected: FAIL with missing storage quota fields or helper methods.

- [ ] **Step 3: Add durable quota fields and repository helpers**

```ts
export const users = pgTable(
  'users',
  {
    // existing columns...
    storageQuotaBytes: integer('storage_quota_bytes').notNull().default(0),
    storageUsedBytes: integer('storage_used_bytes').notNull().default(0),
  },
  (table) => [
    // existing indexes...
    check('users_storage_quota_bytes_non_negative', sql`${table.storageQuotaBytes} >= 0`),
    check('users_storage_used_bytes_non_negative', sql`${table.storageUsedBytes} >= 0`),
  ],
);

export type UserStorageQuota = {
  storageQuotaBytes: number;
  storageUsedBytes: number;
};

export function canAllocateStorage(quota: UserStorageQuota, byteSize: number) {
  return quota.storageUsedBytes + byteSize <= quota.storageQuotaBytes;
}
```

- [ ] **Step 4: Run the quota tests to verify they pass**

Run: `pnpm exec tsx --test src/server/repositories/users.test.ts`

Expected: PASS with non-negative quota enforcement and usage updates verified.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/repositories/users.ts src/server/repositories/users.test.ts
git commit -m "feat: add user storage quota accounting"
```

## Task 3: Build COS Client and Explicit Save Service

**Files:**
- Create: `src/server/media/cos-client.ts`
- Create: `src/server/media/save-generated-media.ts`
- Create: `src/server/media/save-generated-media.test.ts`
- Modify: `src/server/agent/types.ts`
- Modify: `src/server/agent/media-results.ts`
- Modify: `src/server/repositories/agent-runs.ts`
- Modify: `src/server/repositories/generated-media-assets.ts`

- [ ] **Step 1: Write the failing save-service tests**

```ts
test('save generated media uploads to COS, creates asset, and marks artifact saved', async () => {
  const saveService = createSaveGeneratedMediaService({
    runRepository: createMemoryAgentRunRepositoryWithImageArtifact(),
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    userStorageRepository: createMemoryUserStorageRepository({
      'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
    }),
    cosClient: {
      uploadObject: async () => ({
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-1.png',
      }),
      deleteObject: async () => undefined,
      createSignedReadUrl: async () => 'https://cos.example/object',
    },
    fetchSource: async () => ({
      bytes: Buffer.from('png'),
      mimeType: 'image/png',
      byteSize: 3,
      width: 1,
      height: 1,
      durationSeconds: null,
    }),
  });

  const result = await saveService.saveForUser({
    userId: 'user-1',
    runId: 'run-1',
    artifactId: 'artifact-1',
  });

  assert.equal(result.asset.kind, 'image');
  assert.equal(result.updatedArtifact.metadata.saveStatus, 'saved');
});

test('save generated media returns existing asset for duplicate save requests', async () => {
  const service = createSaveGeneratedMediaService(/* same source and existing asset setup */);
  const first = await service.saveForUser({ userId: 'user-1', runId: 'run-1', artifactId: 'artifact-1' });
  const second = await service.saveForUser({ userId: 'user-1', runId: 'run-1', artifactId: 'artifact-1' });

  assert.equal(second.asset.id, first.asset.id);
});

test('save generated media marks artifact save_failed when COS upload fails', async () => {
  const service = createSaveGeneratedMediaService({
    // same setup...
    cosClient: {
      uploadObject: async () => {
        throw new Error('upload failed');
      },
      deleteObject: async () => undefined,
      createSignedReadUrl: async () => 'https://cos.example/object',
    },
  });

  await assert.rejects(
    () => service.saveForUser({ userId: 'user-1', runId: 'run-1', artifactId: 'artifact-1' }),
    /upload failed/,
  );

  const detail = await service.dependencies.runRepository.getRunDetailForUser('run-1', 'user-1');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveStatus, 'save_failed');
});
```

- [ ] **Step 2: Run the focused save-service tests to verify they fail**

Run: `pnpm exec tsx --test src/server/media/save-generated-media.test.ts`

Expected: FAIL with missing `createSaveGeneratedMediaService`, COS client, and DTO support.

- [ ] **Step 3: Implement COS client and save service with idempotent save semantics**

```ts
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createTencentCosClient(config: {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async uploadObject(input: { objectKey: string; body: Uint8Array; contentType: string }) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );

      return {
        bucket: config.bucket,
        region: config.region,
        objectKey: input.objectKey,
      };
    },
    async deleteObject(objectKey: string) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    },
    async createSignedReadUrl(objectKey: string, expiresInSeconds = 600) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}
```

- [ ] **Step 4: Run the focused save-service tests to verify they pass**

Run: `pnpm exec tsx --test src/server/media/save-generated-media.test.ts src/server/repositories/generated-media-assets.test.ts src/server/repositories/agent-runs.test.ts`

Expected: PASS with save success, duplicate idempotency, quota rejection, and upload-failure state transitions green.

- [ ] **Step 5: Commit**

```bash
git add src/server/media/cos-client.ts src/server/media/save-generated-media.ts src/server/media/save-generated-media.test.ts src/server/agent/types.ts src/server/agent/media-results.ts src/server/repositories/agent-runs.ts src/server/repositories/generated-media-assets.ts
git commit -m "feat: add explicit generated media save service"
```

## Task 4: Expose User Media APIs

**Files:**
- Create: `src/app/api/user/media-assets/route.ts`
- Create: `src/app/api/user/media-assets/[assetId]/route.ts`
- Create: `src/app/api/user/media-assets/reuse/route.ts`
- Create: `src/app/api/user/media-assets/route.test.ts`
- Create: `src/app/api/user/media-assets/[assetId]/route.test.ts`
- Modify: `src/lib/api-response.ts` only if existing helpers need typed extension

- [ ] **Step 1: Write the failing route tests**

```ts
test('POST /api/user/media-assets saves a generated artifact for the current user', async () => {
  const response = await POST(
    new Request('https://example.com/api/user/media-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'run-1', artifactId: 'artifact-1' }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.runId, 'run-1');
  assert.equal(body.artifact.metadata.saveStatus, 'saved');
});

test('POST /api/user/media-assets rejects cross-user save attempts', async () => {
  const response = await POST(
    new Request('https://example.com/api/user/media-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'run-2', artifactId: 'artifact-9' }),
    }),
  );

  assert.equal(response.status, 404);
});

test('DELETE /api/user/media-assets/[assetId] soft deletes the asset and frees quota', async () => {
  const response = await DELETE(new Request('https://example.com/api/user/media-assets/asset-1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.status, 'deleted');
});
```

- [ ] **Step 2: Run the focused route tests to verify they fail**

Run: `pnpm exec tsx --test src/app/api/user/media-assets/route.test.ts src/app/api/user/media-assets/[assetId]/route.test.ts`

Expected: FAIL with missing route files and handlers.

- [ ] **Step 3: Implement save/list/detail/delete/reuse routes with strict user scoping**

```ts
const createSavedMediaBodySchema = z.object({
  runId: z.string().uuid(),
  artifactId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await requireActiveAccount();
  const body = createSavedMediaBodySchema.parse(await request.json());

  const result = await createSaveGeneratedMediaService().saveForUser({
    userId: session.user.id,
    runId: body.runId,
    artifactId: body.artifactId,
  });

  return NextResponse.json({
    asset: result.asset,
    artifact: result.updatedArtifact,
  });
}
```

- [ ] **Step 4: Run the focused route tests to verify they pass**

Run: `pnpm exec tsx --test src/app/api/user/media-assets/route.test.ts src/app/api/user/media-assets/[assetId]/route.test.ts src/server/media/save-generated-media.test.ts`

Expected: PASS with auth, validation, isolation, duplicate save, and delete behaviors covered.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user/media-assets/route.ts src/app/api/user/media-assets/[assetId]/route.ts src/app/api/user/media-assets/reuse/route.ts src/app/api/user/media-assets/route.test.ts src/app/api/user/media-assets/[assetId]/route.test.ts
git commit -m "feat: add user media asset api"
```

## Task 5: Add User Runtime Client Helpers and Media Library UI

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`
- Modify: `src/app/image-gen/page.tsx`
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/app/user-center/page.tsx`
- Create: `src/features/public/user-media-module.tsx`
- Create: `src/features/public/user-media-module.test.tsx` if feasible in the existing test stack

- [ ] **Step 1: Write the failing client/UI tests**

```ts
test('saveGeneratedMedia returns saved asset payload and artifact save state', async () => {
  mockUserApi('/api/user/media-assets', {
    status: 200,
    json: {
      asset: { id: 'asset-1', runId: 'run-1', kind: 'image', byteSize: 1024 },
      artifact: { id: 'artifact-1', metadata: { saveStatus: 'saved', savedAssetId: 'asset-1' } },
    },
  });

  const result = await saveGeneratedMedia({ runId: 'run-1', artifactId: 'artifact-1' });
  assert.equal(result.asset.id, 'asset-1');
  assert.equal(result.artifact.metadata.saveStatus, 'saved');
});
```

```tsx
test('user media module renders saved assets and a reuse action', () => {
  render(
    <UserMediaModule
      assets={[
        {
          id: 'asset-1',
          kind: 'image',
          title: '封面图',
          byteSize: 1024,
          sourceModel: 'seedream-3',
          createdAt: '2026-06-03T12:00:00.000Z',
        },
      ]}
    />,
  );

  assert.ok(screen.getByText('封面图'));
  assert.ok(screen.getByRole('button', { name: '插入到当前对话' }));
});
```

- [ ] **Step 2: Run the focused client/UI tests to verify they fail**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts src/features/public/user-media-module.test.tsx`

Expected: FAIL with missing helper functions/components and artifact save metadata parsing.

- [ ] **Step 3: Implement client helpers and user surfaces**

```ts
export type SavedMediaAsset = {
  id: string;
  runId: string;
  conversationId: string;
  kind: 'image' | 'video';
  title: string;
  mimeType: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  sourceModel: string;
  createdAt: string;
  signedUrl?: string;
};

export async function saveGeneratedMedia(input: { runId: string; artifactId: string }) {
  const response = await userApiRequest('/api/user/media-assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  // parse response...
}
```

```tsx
{generatedImage ? (
  <div className="space-y-3">
    <img src={generatedImage.artifact.delivery.url} alt={generatedImage.artifact.title} />
    <div className="flex gap-2">
      <Button onClick={handleDownloadImage}>下载图片</Button>
      <Button
        onClick={() => handleSaveArtifact(currentRunId, generatedImage.artifact.id)}
        disabled={generatedImage.artifact.metadata.saveStatus === 'saving'}
      >
        {readSaveButtonLabel(generatedImage.artifact.metadata)}
      </Button>
    </div>
  </div>
) : null}
```

- [ ] **Step 4: Run the focused client/UI tests to verify they pass**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts src/features/public/user-media-module.test.tsx`

Expected: PASS with typed client parsing, save flow response handling, and media-module rendering covered.

- [ ] **Step 5: Commit**

```bash
git add src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts src/app/image-gen/page.tsx src/app/video-gen/page.tsx src/app/user-center/page.tsx src/features/public/user-media-module.tsx src/features/public/user-media-module.test.tsx
git commit -m "feat: add user media library surfaces"
```

## Task 6: Add Admin Audit Fields and Views

**Files:**
- Modify: `src/server/repositories/ai-jobs.ts`
- Modify: `src/features/admin/admin-ai-jobs-module.tsx`
- Modify: relevant admin repository/module tests such as `src/server/repositories/ai-jobs.test.ts` if present or add a focused test file

- [ ] **Step 1: Write the failing admin audit tests**

```ts
test('admin ai jobs repository includes media save status and saved asset storage fields', async () => {
  const rows = await createAdminAiJobsReadRepository().listRows();
  const mediaRow = rows.find((row) => row.runId === 'run-image-1');

  assert.equal(mediaRow?.saveStatus, 'saved');
  assert.equal(mediaRow?.savedAssetCount, 1);
  assert.equal(mediaRow?.storageBytes, 1024);
});
```

- [ ] **Step 2: Run the focused admin audit tests to verify they fail**

Run: `pnpm exec tsx --test src/server/repositories/ai-jobs.test.ts`

Expected: FAIL with missing save-status/storage audit fields.

- [ ] **Step 3: Extend admin run aggregation and UI detail rendering**

```ts
type AdminAiJobRow = {
  runId: string;
  userId: string;
  taskType: string;
  status: string;
  modelSummary: string | null;
  creditCost: number | null;
  saveStatus: 'not_saved' | 'saving' | 'saved' | 'save_failed' | 'source_expired' | null;
  savedAssetCount: number;
  storageBytes: number | null;
  objectKeys: string[];
};
```

```tsx
<td className="text-xs text-muted-foreground">
  {row.saveStatus ? formatAdminSaveStatus(row.saveStatus) : '未保存'}
</td>
<td className="text-xs text-muted-foreground">
  {row.savedAssetCount > 0 ? `${formatBytes(row.storageBytes ?? 0)} · ${row.objectKeys[0]}` : '—'}
</td>
```

- [ ] **Step 4: Run the focused admin audit tests to verify they pass**

Run: `pnpm exec tsx --test src/server/repositories/ai-jobs.test.ts`

Expected: PASS with generation/storage audit aggregation covered.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/ai-jobs.ts src/server/repositories/ai-jobs.test.ts src/features/admin/admin-ai-jobs-module.tsx
git commit -m "feat: add admin media storage audit"
```

## Task 7: Generate Migration and Verify End-to-End

**Files:**
- Modify: `drizzle/*` generated migration artifacts
- Create: `docs/superpowers/verification/2026-06-03-multimodal-media-storage-verification.md`

- [ ] **Step 1: Generate the Drizzle migration**

Run: `pnpm db:generate`

Expected: A new migration is created for `generated_media_assets`, storage quota fields, and any enum changes.

- [ ] **Step 2: Apply the migration in the local environment**

Run: `pnpm db:migrate`

Expected: PASS if `DATABASE_URL` is configured; otherwise record the exact blocker in the verification note.

- [ ] **Step 3: Run targeted automated verification**

Run: `pnpm exec tsx --test src/server/repositories/generated-media-assets.test.ts src/server/repositories/agent-runs.test.ts src/server/media/save-generated-media.test.ts src/app/api/user/media-assets/route.test.ts src/app/api/user/media-assets/[assetId]/route.test.ts src/features/public/agent-runtime-client.test.ts src/server/repositories/ai-jobs.test.ts`

Expected: PASS with media persistence, save flow, and admin audit coverage green.

- [ ] **Step 4: Run baseline validation and build**

Run: `pnpm validate`
Expected: PASS, or only pre-existing unrelated failures documented precisely.

Run: `pnpm build`
Expected: PASS with the new user/admin routes and UI compiled.

- [ ] **Step 5: Perform browser verification and write the verification note**

Run:

```bash
pnpm dev:pw
pnpm pw:test tests/e2e/image-media-save.spec.ts
pnpm pw:test tests/e2e/video-media-save.spec.ts
```

Expected:
- generated image and video results still render before save;
- save action transitions through `保存中` to `已保存`;
- saved items appear in “我的媒体”;
- admin AI jobs view shows save state and storage details.

If Playwright coverage cannot run because of missing auth/bootstrap/COS env, capture the blocker and perform the strongest available manual browser verification instead.

- [ ] **Step 6: Commit**

```bash
git add drizzle docs/superpowers/verification/2026-06-03-multimodal-media-storage-verification.md
git commit -m "test: verify multimodal media storage"
```

## Self-Review

Spec coverage check:

- Explicit user-controlled save flow is covered by Tasks 3-5.
- Separate generation truth vs cloud-drive truth is covered by Tasks 1, 3, and 6.
- COS object persistence and isolation are covered by Tasks 1 and 3.
- Storage quota accounting is covered by Task 2 and exercised again in Task 3.
- User-facing media library and reuse entry points are covered by Task 5.
- Admin audit visibility is covered by Task 6.
- Migration, validation, and browser verification are covered by Task 7.

Placeholder scan:

- No `TODO`/`TBD` placeholders remain.
- Each task lists exact files, commands, and concrete test/implementation snippets.

Type consistency:

- The plan consistently uses `runId`, `artifactId`, and `assetId` as the only trusted client identifiers.
- Conversation-level save state is consistently represented on `agent_artifacts.metadata.saveStatus`.
- Durable asset truth is consistently represented by `generated_media_assets`.
