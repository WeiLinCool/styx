import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminMediaAssetAccessRouteHandlers } from './route';

test('GET /api/admin/media-assets/[assetId]/access returns signed access for admin and records audit', async () => {
  const auditCalls: Array<Record<string, unknown>> = [];

  const handlers = createAdminMediaAssetAccessRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getAssetForAdmin: async () => ({
      id: 'asset-1',
      userId: 'user-1',
      runId: null,
      conversationId: null,
      artifactId: null,
      kind: 'image',
      title: 'Admin preview',
      sourceType: 'user_uploaded',
      sourceProvider: null,
      sourceModel: null,
      sourceUrl: null,
      sourceExpiresAt: null,
      originalFilename: 'photo.png',
      sha256: 'sha',
      shareId: null,
      shareStatus: 'disabled',
      sharedAt: null,
      storageProvider: 'tencent_cos',
      bucket: 'bucket-a',
      region: 'ap-shanghai',
      objectKey: 'path/to/object.png',
      mimeType: 'image/png',
      byteSize: 128,
      width: 64,
      height: 64,
      durationSeconds: null,
      status: 'ready',
      metadata: {},
      saveRequestedAt: '2026-06-04T10:00:00.000Z',
      savedAt: '2026-06-04T10:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    }),
    createAccessUrl: async ({ assetId, disposition }) => ({
      assetId,
      disposition,
      url: 'https://signed.example/admin',
      expiresAt: '2026-06-04T10:10:00.000Z',
      mimeType: 'image/png',
    }),
    recordAudit: async (input) => {
      auditCalls.push(input);
    },
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/admin/media-assets/asset-1/access?disposition=preview'),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.access.url, 'https://signed.example/admin');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0]?.type, 'admin.media_asset.accessed');
});
