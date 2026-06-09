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
      sourceType: 'ai_generated',
      sourceProvider: 'doubao',
      sourceModel: 'seedream-3',
      sourceUrl: null,
      sourceExpiresAt: null,
      originalFilename: null,
      sha256: null,
      shareId: 'share-1',
      shareStatus: 'disabled',
      sharedAt: '2026-06-03T12:00:01.000Z',
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
    updateSavedAssetTitle: async () => null,
  });

  const response = await handlers.DELETE(new Request('https://example.com/api/user/media-assets/asset-1'), {
    params: Promise.resolve({ assetId: 'asset-1' }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.status, 'deleted');
  assert.equal(body.asset.shareStatus, 'disabled');
});

test('GET /api/user/media-assets/[assetId] returns not found when user does not own the asset', async () => {
  const handlers = createMediaAssetByIdRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    deleteSavedAsset: async () => null,
    updateSavedAssetTitle: async () => null,
  });

  const response = await handlers.GET(new Request('https://example.com/api/user/media-assets/asset-1'), {
    params: Promise.resolve({ assetId: 'asset-1' }),
  });

  assert.equal(response.status, 404);
});

test('PATCH /api/user/media-assets/[assetId] updates title for current user asset', async () => {
  const handlers = createMediaAssetByIdRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    deleteSavedAsset: async () => null,
    updateSavedAssetTitle: async (assetId, userId, title) => ({
      id: assetId,
      userId,
      runId: null,
      conversationId: null,
      artifactId: null,
      kind: 'image',
      title,
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
      objectKey: 'key',
      mimeType: 'image/png',
      byteSize: 1024,
      width: 512,
      height: 512,
      durationSeconds: null,
      status: 'ready',
      metadata: {},
      saveRequestedAt: '2026-06-03T12:00:00.000Z',
      savedAt: '2026-06-03T12:00:01.000Z',
      deletedAt: null,
      createdAt: '2026-06-03T12:00:00.000Z',
      updatedAt: '2026-06-03T12:01:00.000Z',
    }),
  });

  const response = await handlers.PATCH(
    new Request('https://example.com/api/user/media-assets/asset-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  Renamed title  ' }),
    }),
    {
      params: Promise.resolve({ assetId: 'asset-1' }),
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.title, 'Renamed title');
});

test('PATCH /api/user/media-assets/[assetId] rejects empty or oversized title', async () => {
  const handlers = createMediaAssetByIdRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    deleteSavedAsset: async () => null,
    updateSavedAssetTitle: async () => null,
  });

  const emptyResponse = await handlers.PATCH(
    new Request('https://example.com/api/user/media-assets/asset-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    }),
    {
      params: Promise.resolve({ assetId: 'asset-1' }),
    },
  );
  assert.equal(emptyResponse.status, 400);

  const longResponse = await handlers.PATCH(
    new Request('https://example.com/api/user/media-assets/asset-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a'.repeat(101) }),
    }),
    {
      params: Promise.resolve({ assetId: 'asset-1' }),
    },
  );
  assert.equal(longResponse.status, 400);
});

test('PATCH /api/user/media-assets/[assetId] returns not found when asset cannot be renamed', async () => {
  const handlers = createMediaAssetByIdRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    deleteSavedAsset: async () => null,
    updateSavedAssetTitle: async () => null,
  });

  const response = await handlers.PATCH(
    new Request('https://example.com/api/user/media-assets/asset-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed title' }),
    }),
    {
      params: Promise.resolve({ assetId: 'asset-1' }),
    },
  );

  assert.equal(response.status, 404);
});
