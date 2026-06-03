import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaAssetByIdRouteHandlers } from './route';

test('DELETE /api/user/media-assets/[assetId] soft deletes the asset for the current user', async () => {
  const handlers = createMediaAssetByIdRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    deleteSavedAsset: async (assetId, userId) => ({
      id: assetId,
      userId,
      runId: 'run-1',
      conversationId: 'conversation-1',
      artifactId: 'artifact-1',
      kind: 'image',
      title: '生成图片',
      sourceProvider: 'doubao',
      sourceModel: 'seedream-3',
      sourceUrl: null,
      sourceExpiresAt: null,
      storageProvider: 'tencent_cos',
      bucket: 'bucket-a',
      region: 'ap-shanghai',
      objectKey: 'key',
      mimeType: 'image/png',
      byteSize: 1024,
      width: 512,
      height: 512,
      durationSeconds: null,
      status: 'deleted',
      metadata: {},
      saveRequestedAt: '2026-06-03T12:00:00.000Z',
      savedAt: '2026-06-03T12:00:01.000Z',
      deletedAt: '2026-06-03T12:00:02.000Z',
      createdAt: '2026-06-03T12:00:00.000Z',
      updatedAt: '2026-06-03T12:00:02.000Z',
    }),
  });

  const response = await handlers.DELETE(new Request('https://example.com/api/user/media-assets/asset-1'), {
    params: Promise.resolve({ assetId: 'asset-1' }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.status, 'deleted');
});

test('GET /api/user/media-assets/[assetId] returns not found when user does not own the asset', async () => {
  const handlers = createMediaAssetByIdRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    deleteSavedAsset: async () => null,
  });

  const response = await handlers.GET(new Request('https://example.com/api/user/media-assets/asset-1'), {
    params: Promise.resolve({ assetId: 'asset-1' }),
  });

  assert.equal(response.status, 404);
});
