# Unified Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified long-lived media library that stores AI-saved and user-uploaded image/video assets together, supports public share pages, and allows admin inspection while keeping Tencent COS private.

**Architecture:** Extend the existing saved-media persistence model into a unified asset domain by adding source and sharing metadata, then layer new upload, sharing, and public/admin access flows on top of the existing COS signed-URL pattern. Keep transient AI-run artifacts separate, and route all durable user-facing media through one repository and one user library UI.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, PostgreSQL, Drizzle ORM, Tencent COS via AWS S3 SDK compatibility, existing auth/audit services

---

### Task 1: Extend the Durable Media Asset Schema

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/agent/types.ts`
- Modify: `src/server/repositories/generated-media-assets.ts`
- Test: `src/server/repositories/generated-media-assets.test.ts`

- [ ] **Step 1: Write failing repository tests for unified asset metadata and share fields**

Add tests to `src/server/repositories/generated-media-assets.test.ts` that create assets with both source types and verify:

```ts
test('generated media asset repository stores user-uploaded source metadata and share state', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'Uploaded image',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'photo.png',
    sha256: 'sha256-1',
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-1/photo.png',
    mimeType: 'image/png',
    byteSize: 12,
    width: 100,
    height: 100,
    durationSeconds: null,
    metadata: {},
  });

  assert.equal(asset.sourceType, 'user_uploaded');
  assert.equal(asset.originalFilename, 'photo.png');
  assert.equal(asset.shareStatus, 'disabled');
  assert.equal(asset.shareId, null);
});

test('generated media asset repository preserves ai-generated source metadata', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: 'run-1',
    conversationId: 'conversation-1',
    artifactId: 'artifact-1',
    kind: 'video',
    title: 'Saved video',
    sourceType: 'ai_generated',
    sourceProvider: 'doubao',
    sourceModel: 'seed-video',
    sourceUrl: 'https://provider.example/video.mp4',
    sourceExpiresAt: '2026-06-04T10:00:00.000Z',
    originalFilename: null,
    sha256: null,
    shareId: 'share-1',
    shareStatus: 'active',
    sharedAt: '2026-06-04T10:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-1.mp4',
    mimeType: 'video/mp4',
    byteSize: 128,
    width: 1920,
    height: 1080,
    durationSeconds: 3.2,
    metadata: {},
  });

  assert.equal(asset.sourceType, 'ai_generated');
  assert.equal(asset.sourceProvider, 'doubao');
  assert.equal(asset.shareStatus, 'active');
  assert.equal(asset.shareId, 'share-1');
});
```

- [ ] **Step 2: Run the targeted repository tests and confirm failure**

Run: `pnpm test src/server/repositories/generated-media-assets.test.ts`

Expected: FAIL because `CreateSavedAssetInput` and `GeneratedMediaAssetDto` do not yet support `sourceType`, nullable AI-origin IDs, upload metadata, or share metadata.

- [ ] **Step 3: Extend DTO types for the unified asset model**

Update `src/server/agent/types.ts` so the durable asset DTO includes:

```ts
export type MediaAssetSourceType = 'ai_generated' | 'user_uploaded';
export type MediaAssetShareStatus = 'disabled' | 'active';

export type GeneratedMediaAssetDto = {
  id: string;
  userId: string;
  runId: string | null;
  conversationId: string | null;
  artifactId: string | null;
  kind: Extract<AgentArtifactKind, 'image' | 'video'>;
  title: string;
  sourceType: MediaAssetSourceType;
  sourceProvider: string | null;
  sourceModel: string | null;
  sourceUrl: string | null;
  sourceExpiresAt: string | null;
  originalFilename: string | null;
  sha256: string | null;
  shareId: string | null;
  shareStatus: MediaAssetShareStatus;
  sharedAt: string | null;
  storageProvider: string;
  bucket: string;
  region: string;
  objectKey: string;
  mimeType: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  status: GeneratedMediaAssetStatus;
  metadata: Record<string, unknown>;
  saveRequestedAt: string;
  savedAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Extend the schema and repository input types**

Update `src/server/db/schema.ts` to add:

```ts
export const mediaAssetSourceType = pgEnum('media_asset_source_type', ['ai_generated', 'user_uploaded']);
export const mediaAssetShareStatus = pgEnum('media_asset_share_status', ['disabled', 'active']);
```

Extend `generatedMediaAssets` with:

```ts
runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
conversationId: uuid('conversation_id'),
artifactId: uuid('artifact_id'),
sourceType: mediaAssetSourceType('source_type').notNull().default('ai_generated'),
sourceProvider: text('source_provider'),
sourceModel: text('source_model'),
originalFilename: text('original_filename'),
sha256: text('sha256'),
shareId: text('share_id'),
shareStatus: mediaAssetShareStatus('share_status').notNull().default('disabled'),
sharedAt: timestamp('shared_at', { withTimezone: true }),
```

Update `CreateSavedAssetInput` and DTO mapping in `src/server/repositories/generated-media-assets.ts` so the new fields round-trip correctly and nullable AI-origin fields are accepted.

- [ ] **Step 5: Run repository tests and confirm pass**

Run: `pnpm test src/server/repositories/generated-media-assets.test.ts`

Expected: PASS with the new unified metadata fields supported.

- [ ] **Step 6: Commit the schema/domain expansion**

```bash
git add src/server/db/schema.ts src/server/agent/types.ts src/server/repositories/generated-media-assets.ts src/server/repositories/generated-media-assets.test.ts
git commit -m "feat: extend media asset schema for unified library"
```

### Task 2: Preserve Existing AI-Save Flow on the Unified Asset Model

**Files:**
- Modify: `src/server/media/save-generated-media.ts`
- Modify: `src/server/media/save-generated-media.test.ts`
- Modify: `src/app/api/user/media-assets/route.ts`
- Test: `src/app/api/user/media-assets/route.test.ts`

- [ ] **Step 1: Write failing tests for AI-saved assets tagging**

Add assertions to `src/server/media/save-generated-media.test.ts`:

```ts
assert.equal(result.asset.sourceType, 'ai_generated');
assert.equal(result.asset.originalFilename, null);
assert.equal(result.asset.shareStatus, 'disabled');
assert.equal(result.asset.shareId, null);
```

Add assertions to `src/app/api/user/media-assets/route.test.ts`:

```ts
assert.equal(body.asset.sourceType, 'ai_generated');
assert.equal(body.asset.shareStatus, 'disabled');
```

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `pnpm test src/server/media/save-generated-media.test.ts src/app/api/user/media-assets/route.test.ts`

Expected: FAIL because the save flow does not populate unified source/share fields yet.

- [ ] **Step 3: Update AI-save service defaults**

In `src/server/media/save-generated-media.ts`, extend the `createSavedAsset` payload:

```ts
const savedAsset = await dependencies.mediaAssetRepository.createSavedAsset({
  userId: input.userId,
  runId: run.id,
  conversationId: run.conversationId,
  artifactId: artifact.id,
  kind: artifact.kind === 'video' ? 'video' : 'image',
  title: artifact.title,
  sourceType: 'ai_generated',
  sourceProvider: run.capabilitySummary.provider,
  sourceModel: run.capabilitySummary.model,
  sourceUrl,
  sourceExpiresAt: readString(metadata, 'providerExpiresAt'),
  originalFilename: null,
  sha256: null,
  shareId: null,
  shareStatus: 'disabled',
  sharedAt: null,
  storageProvider: 'tencent_cos',
  bucket: uploaded.bucket,
  region: uploaded.region,
  objectKey: uploaded.objectKey,
  mimeType: downloaded.mimeType,
  byteSize: downloaded.byteSize,
  width: downloaded.width ?? readNumber(metadata, 'width'),
  height: downloaded.height ?? readNumber(metadata, 'height'),
  durationSeconds: downloaded.durationSeconds ?? readNumber(metadata, 'durationSeconds'),
  metadata: {},
});
```

- [ ] **Step 4: Keep route behavior stable while returning unified fields**

Adjust `src/app/api/user/media-assets/route.ts` only as needed so the response shape still returns `{ asset, artifact }` and now includes the unified asset metadata.

- [ ] **Step 5: Re-run the targeted tests**

Run: `pnpm test src/server/media/save-generated-media.test.ts src/app/api/user/media-assets/route.test.ts`

Expected: PASS with existing AI-save behavior preserved and unified source tagging added.

- [ ] **Step 6: Commit the AI-save compatibility update**

```bash
git add src/server/media/save-generated-media.ts src/server/media/save-generated-media.test.ts src/app/api/user/media-assets/route.ts src/app/api/user/media-assets/route.test.ts
git commit -m "feat: tag saved ai media in unified asset library"
```

### Task 3: Add Upload Service and User Upload API

**Files:**
- Create: `src/server/media/upload-user-media.ts`
- Create: `src/server/media/upload-user-media.test.ts`
- Create: `src/app/api/user/media-assets/upload/route.ts`
- Create: `src/app/api/user/media-assets/upload/route.test.ts`
- Modify: `src/server/media/cos-client.ts`
- Modify: `src/server/repositories/users.ts`

- [ ] **Step 1: Write failing service tests for user upload**

Create `src/server/media/upload-user-media.test.ts` with coverage for successful upload and quota/type rejection:

```ts
test('upload user media stores uploaded image in cos and creates unified asset', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const storageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });
  let uploadedKey = '';

  const service = createUploadUserMediaService({
    mediaAssetRepository: repository,
    userStorageRepository: storageRepository,
    cosClient: {
      async uploadObject(input) {
        uploadedKey = input.objectKey;
        return { bucket: 'bucket-a', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      async deleteObject() {},
    },
    createObjectKey: ({ userId, assetId, filename }) =>
      `user-uploaded/test/users/${userId}/assets/${assetId}/${filename}`,
    computeSha256: async () => 'sha256-1',
  });

  const result = await service.uploadForUser({
    userId: 'user-1',
    title: 'My upload',
    filename: 'photo.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
  });

  assert.equal(result.asset.sourceType, 'user_uploaded');
  assert.equal(result.asset.originalFilename, 'photo.png');
  assert.equal(result.asset.shareStatus, 'disabled');
  assert.equal(uploadedKey, 'user-uploaded/test/users/user-1/assets/' + result.asset.id + '/photo.png');
});

test('upload user media rejects quota overflow before recording asset', async () => {
  // create service with quota smaller than byte length
  // assert reject message includes storage quota exceeded semantics
});
```

- [ ] **Step 2: Write failing route tests for multipart upload**

Create `src/app/api/user/media-assets/upload/route.test.ts` with tests like:

```ts
test('POST /api/user/media-assets/upload uploads a user image asset', async () => {
  const formData = new FormData();
  formData.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
  formData.set('title', 'My upload');

  const response = await handlers.POST(new Request('https://example.com/api/user/media-assets/upload', {
    method: 'POST',
    body: formData,
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.sourceType, 'user_uploaded');
});
```

- [ ] **Step 3: Run the upload tests and confirm failure**

Run: `pnpm test src/server/media/upload-user-media.test.ts src/app/api/user/media-assets/upload/route.test.ts`

Expected: FAIL because the upload service and route do not exist yet.

- [ ] **Step 4: Implement the upload service**

Create `src/server/media/upload-user-media.ts` with a focused service:

```ts
export function createUploadUserMediaService(dependencies: {
  mediaAssetRepository: GeneratedMediaAssetRepository;
  userStorageRepository: UserStorageRepository;
  cosClient: Pick<TencentCosClient, 'uploadObject' | 'deleteObject'>;
  createObjectKey: (input: { userId: string; assetId: string; filename: string; mimeType: string }) => string;
  computeSha256: (bytes: Uint8Array) => Promise<string>;
}) {
  return {
    async uploadForUser(input: {
      userId: string;
      title: string;
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
    }) {
      // validate quota, derive kind, compute digest, upload to cos, create asset, increment quota
    },
  };
}
```

Implement explicit MIME allow-list for:

```ts
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4']);
```

- [ ] **Step 5: Implement the multipart route**

Create `src/app/api/user/media-assets/upload/route.ts` with:

```ts
const handlers = createMediaAssetUploadRouteHandlers({
  requireSession: requireActiveAccount,
  uploadMedia: (input) => service.uploadForUser(input),
});
```

The route should:

- call `await request.formData()`
- read `file` and optional `title`
- reject missing file with `400`
- reject unsupported MIME with `400`
- pass bytes, filename, MIME, and final title into the upload service

- [ ] **Step 6: Re-run upload tests**

Run: `pnpm test src/server/media/upload-user-media.test.ts src/app/api/user/media-assets/upload/route.test.ts`

Expected: PASS with successful upload and validation failures covered.

- [ ] **Step 7: Commit the upload flow**

```bash
git add src/server/media/upload-user-media.ts src/server/media/upload-user-media.test.ts src/app/api/user/media-assets/upload/route.ts src/app/api/user/media-assets/upload/route.test.ts src/server/media/cos-client.ts src/server/repositories/users.ts
git commit -m "feat: add user media upload flow"
```

### Task 4: Add Share-State Repository Operations and Public Share Read Path

**Files:**
- Modify: `src/server/repositories/generated-media-assets.ts`
- Modify: `src/server/repositories/generated-media-assets.test.ts`
- Create: `src/server/media/create-public-media-share.ts`
- Create: `src/server/media/create-public-media-share.test.ts`
- Create: `src/app/api/user/media-assets/[assetId]/share/route.ts`
- Create: `src/app/api/user/media-assets/[assetId]/share/route.test.ts`
- Create: `src/app/api/public/media-share/[shareId]/route.ts`
- Create: `src/app/api/public/media-share/[shareId]/route.test.ts`

- [ ] **Step 1: Write failing repository tests for share enable/disable and lookup**

Add tests like:

```ts
test('generated media asset repository enables and disables sharing', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const asset = await repository.createSavedAsset({ /* valid unified asset */ });

  const shared = await repository.enableSharingForUser(asset.id, asset.userId, {
    shareId: 'share-1',
    sharedAt: '2026-06-04T10:00:00.000Z',
  });
  assert.equal(shared?.shareStatus, 'active');
  assert.equal(shared?.shareId, 'share-1');

  const disabled = await repository.disableSharingForUser(asset.id, asset.userId);
  assert.equal(disabled?.shareStatus, 'disabled');
});

test('generated media asset repository resolves active share by shareId only for non-deleted assets', async () => {
  // assert active share lookup works and deleted/disabled assets are excluded
});
```

- [ ] **Step 2: Run the repository tests and confirm failure**

Run: `pnpm test src/server/repositories/generated-media-assets.test.ts`

Expected: FAIL because share-state repository methods do not exist yet.

- [ ] **Step 3: Implement repository share-state methods**

Extend `GeneratedMediaAssetRepository` with:

```ts
enableSharingForUser(assetId: string, userId: string, input: { shareId: string; sharedAt: string }): Promise<GeneratedMediaAssetDto | null>;
disableSharingForUser(assetId: string, userId: string): Promise<GeneratedMediaAssetDto | null>;
getActiveSharedAssetByShareId(shareId: string): Promise<GeneratedMediaAssetDto | null>;
```

Make deleted assets ineligible for public share lookup.

- [ ] **Step 4: Write failing route/service tests for owner share toggle and public share read**

Create `src/server/media/create-public-media-share.test.ts` and route tests with expectations like:

```ts
assert.equal(body.asset.shareStatus, 'active');
assert.equal(body.share.url, 'https://example.com/shared/media/share-1');
```

and:

```ts
assert.equal(body.asset.id, 'asset-1');
assert.equal(body.access.url, 'https://signed.example/object');
```

- [ ] **Step 5: Implement share service and routes**

Create `src/server/media/create-public-media-share.ts` with focused helpers for:

- generating a share ID when missing
- shaping the public share payload

Create owner route `src/app/api/user/media-assets/[assetId]/share/route.ts` supporting:

```ts
POST -> enable sharing
DELETE -> disable sharing
```

Create public route `src/app/api/public/media-share/[shareId]/route.ts` that:

- resolves asset by `shareId`
- requires `shareStatus=active`
- generates a short-lived preview/download signed URL
- returns sanitized public payload only

- [ ] **Step 6: Re-run share tests**

Run: `pnpm test src/server/media/create-public-media-share.test.ts src/app/api/user/media-assets/[assetId]/share/route.test.ts src/app/api/public/media-share/[shareId]/route.test.ts src/server/repositories/generated-media-assets.test.ts`

Expected: PASS with share enable/disable and public lookup behavior working.

- [ ] **Step 7: Commit the share-state implementation**

```bash
git add src/server/repositories/generated-media-assets.ts src/server/repositories/generated-media-assets.test.ts src/server/media/create-public-media-share.ts src/server/media/create-public-media-share.test.ts src/app/api/user/media-assets/[assetId]/share/route.ts src/app/api/user/media-assets/[assetId]/share/route.test.ts src/app/api/public/media-share/[shareId]/route.ts src/app/api/public/media-share/[shareId]/route.test.ts
git commit -m "feat: add media sharing flow"
```

### Task 5: Enforce Delete-Invalidates-Share and Storage Usage Accounting

**Files:**
- Modify: `src/server/repositories/generated-media-assets.ts`
- Modify: `src/server/repositories/users.ts`
- Modify: `src/app/api/user/media-assets/[assetId]/route.ts`
- Modify: `src/app/api/user/media-assets/[assetId]/route.test.ts`
- Modify: `src/server/repositories/generated-media-assets.test.ts`

- [ ] **Step 1: Write failing tests for delete semantics**

Add tests verifying:

```ts
test('soft delete clears active sharing from public resolution', async () => {
  // create shared asset, delete it, assert public lookup returns null
});
```

Add route-level expectations in `src/app/api/user/media-assets/[assetId]/route.test.ts` that deletion returns the deleted asset and future reads fail.

- [ ] **Step 2: Run the delete tests and confirm failure**

Run: `pnpm test src/server/repositories/generated-media-assets.test.ts src/app/api/user/media-assets/[assetId]/route.test.ts`

Expected: FAIL because delete flow does not explicitly model share invalidation or storage decrement for unified assets.

- [ ] **Step 3: Update delete repository/service behavior**

Ensure `softDeleteSavedAssetForUser` sets:

```ts
status: 'deleted',
shareStatus: 'disabled',
updatedAt: new Date(),
deletedAt: new Date(),
```

and add any needed storage-usage decrement path via `UserStorageRepository`.

- [ ] **Step 4: Update the delete route to keep access fail-closed**

In `src/app/api/user/media-assets/[assetId]/route.ts`, make the delete handler depend on a domain function that:

- deletes the asset record from user-visible access
- decrements storage usage
- leaves COS cleanup as best effort

- [ ] **Step 5: Re-run delete tests**

Run: `pnpm test src/server/repositories/generated-media-assets.test.ts src/app/api/user/media-assets/[assetId]/route.test.ts`

Expected: PASS with deletion immediately disabling public share resolution.

- [ ] **Step 6: Commit the delete semantics**

```bash
git add src/server/repositories/generated-media-assets.ts src/server/repositories/generated-media-assets.test.ts src/server/repositories/users.ts src/app/api/user/media-assets/[assetId]/route.ts src/app/api/user/media-assets/[assetId]/route.test.ts
git commit -m "feat: invalidate media shares on delete"
```

### Task 6: Add Admin Raw-File Access With Audit Logging

**Files:**
- Create: `src/app/api/admin/media-assets/[assetId]/access/route.ts`
- Create: `src/app/api/admin/media-assets/[assetId]/access/route.test.ts`
- Modify: `src/server/audit/audit-service.ts`
- Modify: `src/server/repositories/generated-media-assets.ts`

- [ ] **Step 1: Write failing admin route test**

Create `src/app/api/admin/media-assets/[assetId]/access/route.test.ts`:

```ts
test('GET /api/admin/media-assets/[assetId]/access returns signed access for admin and records audit', async () => {
  let audited = false;

  const response = await handlers.GET(
    new Request('https://example.com/api/admin/media-assets/asset-1/access?disposition=preview'),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.access.url, 'https://signed.example/admin');
  assert.equal(audited, true);
});
```

- [ ] **Step 2: Run the admin route test and confirm failure**

Run: `pnpm test src/app/api/admin/media-assets/[assetId]/access/route.test.ts`

Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement the admin access route**

Create `src/app/api/admin/media-assets/[assetId]/access/route.ts` following existing admin route patterns:

```ts
const session = await requireAdmin();
const asset = await repository.getSavedAssetForAdmin(assetId);
if (!asset) return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
await recordAuditEvent({
  actorUserId: session.user.id,
  targetUserId: asset.userId,
  entityType: 'media_asset',
  entityId: asset.id,
  action: 'admin.media_asset.accessed',
  metadata: { disposition },
});
```

Return a signed URL using the existing COS client.

- [ ] **Step 4: Re-run the admin route test**

Run: `pnpm test src/app/api/admin/media-assets/[assetId]/access/route.test.ts`

Expected: PASS with admin auth, signed access, and audit logging covered.

- [ ] **Step 5: Commit the admin access flow**

```bash
git add src/app/api/admin/media-assets/[assetId]/access/route.ts src/app/api/admin/media-assets/[assetId]/access/route.test.ts src/server/audit/audit-service.ts src/server/repositories/generated-media-assets.ts
git commit -m "feat: add admin access to media assets"
```

### Task 7: Build the Unified My Media UI and Public Share Page

**Files:**
- Modify: `src/features/public/my-assets-page.tsx`
- Modify: `src/features/public/my-assets-state.ts`
- Modify: `src/features/public/my-assets-state.test.ts`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`
- Create: `src/app/shared/media/[shareId]/page.tsx`
- Create: `src/features/public/shared-media-page.tsx`

- [ ] **Step 1: Write failing UI-state tests for source filtering**

Extend `src/features/public/my-assets-state.test.ts`:

```ts
test('deriveMyAssetsView filters by source type', () => {
  const assets = [
    { id: '1', kind: 'image', title: 'AI Image', sourceType: 'ai_generated', savedAt: '2026-06-03T10:00:00.000Z' },
    { id: '2', kind: 'video', title: 'Upload Video', sourceType: 'user_uploaded', savedAt: '2026-06-02T10:00:00.000Z' },
  ] as GeneratedMediaAssetDto[];

  const filtered = deriveMyAssetsView(assets, {
    search: '',
    kind: 'all',
    sourceType: 'user_uploaded',
    sort: 'newest',
  });

  assert.deepEqual(filtered.map((item) => item.id), ['2']);
});
```

- [ ] **Step 2: Run the view-state tests and confirm failure**

Run: `pnpm test src/features/public/my-assets-state.test.ts`

Expected: FAIL because source-type filters are not implemented yet.

- [ ] **Step 3: Extend client API helpers**

Update `src/features/public/agent-runtime-client.ts` and tests to support:

```ts
export async function uploadUserMedia(input: { file: File; title?: string }) { /* multipart POST */ }
export async function enableMediaShare(assetId: string) { /* POST share */ }
export async function disableMediaShare(assetId: string) { /* DELETE share */ }
export async function getPublicSharedMedia(shareId: string) { /* GET public route */ }
```

- [ ] **Step 4: Update the My Media page**

Modify `src/features/public/my-assets-page.tsx` to add:

- upload button and hidden file input
- source filter select
- share enable/disable action
- copy-share-link action

Use existing patterns such as:

```tsx
const [sourceType, setSourceType] = useState<'all' | 'ai_generated' | 'user_uploaded'>('all');
const [uploading, setUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

and action handlers:

```tsx
const handleUpload = async (file: File) => {
  const asset = await uploadUserMedia({ file });
  setAssets((current) => [asset, ...current]);
};
```

- [ ] **Step 5: Add the public share page**

Create `src/app/shared/media/[shareId]/page.tsx` and `src/features/public/shared-media-page.tsx` that:

- fetch public share payload from `/api/public/media-share/[shareId]`
- render image or video preview
- show unavailable state for missing/disabled/deleted share

- [ ] **Step 6: Re-run targeted frontend tests**

Run: `pnpm test src/features/public/my-assets-state.test.ts src/features/public/agent-runtime-client.test.ts`

Expected: PASS with source filtering and client share/upload helpers covered.

- [ ] **Step 7: Commit the user-facing UI**

```bash
git add src/features/public/my-assets-page.tsx src/features/public/my-assets-state.ts src/features/public/my-assets-state.test.ts src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts src/app/shared/media/[shareId]/page.tsx src/features/public/shared-media-page.tsx
git commit -m "feat: build unified media library ui"
```

### Task 8: Run Migrations and Full Verification

**Files:**
- Modify: `drizzle/*` (generated)
- Modify: `docs/superpowers/verification/2026-06-04-unified-media-library.md`

- [ ] **Step 1: Generate the Drizzle migration**

Run: `pnpm db:generate`

Expected: migration files are created under `drizzle/` for the new media asset fields and enums.

- [ ] **Step 2: Apply the migration locally**

Run: `pnpm db:migrate`

Expected: database applies the media-asset schema updates successfully.

- [ ] **Step 3: Run repository, service, and route validation**

Run: `pnpm validate`

Expected: PASS for lint and type-check coverage.

- [ ] **Step 4: Run production build verification**

Run: `pnpm build`

Expected: PASS with App Router pages and API routes wired correctly.

- [ ] **Step 5: Run browser verification**

Run: `pnpm dev`

Verify manually in the browser:

- upload a local image and confirm it appears in `/my-assets`
- upload a local video and confirm preview/download works
- save an AI-generated asset and confirm it appears in the same list
- filter by `AI Generated` and `User Uploaded`
- enable sharing and open the public share page
- delete the asset and confirm the public share page immediately becomes unavailable
- confirm admin access route works if admin credentials are available

- [ ] **Step 6: Record verification notes**

Create `docs/superpowers/verification/2026-06-04-unified-media-library.md` with:

```md
# Unified Media Library Verification

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm validate`
- `pnpm build`
- Browser checks performed:
  - upload image
  - upload video
  - save AI asset
  - source filtering
  - public share enable/disable
  - delete invalidates share
  - admin access (or blocker if credentials unavailable)
```

- [ ] **Step 7: Commit migration and verification artifacts**

```bash
git add drizzle docs/superpowers/verification/2026-06-04-unified-media-library.md
git commit -m "chore: verify unified media library"
```
