import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaAssetAccessRouteHandlers } from './route';

test('GET /api/user/media-assets/[assetId]/access returns preview url for owned asset', async () => {
  const handlers = createMediaAssetAccessRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => ({
      id: 'asset-1',
      userId: 'user-1',
      runId: 'run-1',
      conversationId: 'conversation-1',
      artifactId: 'artifact-1',
      kind: 'image',
      title: 'preview',
      sourceType: 'ai_generated',
      sourceProvider: 'doubao',
      sourceModel: 'seedream',
      sourceUrl: null,
      sourceExpiresAt: null,
      originalFilename: null,
      sha256: null,
      shareId: null,
      shareStatus: 'disabled',
      sharedAt: null,
      storageProvider: 'tencent_cos',
      bucket: 'bucket',
      region: 'ap-shanghai',
      objectKey: 'path/to/object.png',
      mimeType: 'image/png',
      byteSize: 128,
      width: 64,
      height: 64,
      durationSeconds: null,
      status: 'ready',
      metadata: {},
      saveRequestedAt: '2026-06-03T00:00:00.000Z',
      savedAt: '2026-06-03T00:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    }),
    createAccessUrl: async ({ asset, disposition }) => ({
      assetId: asset.id,
      disposition,
      url: 'https://example.com/signed',
      expiresAt: '2026-06-03T01:00:00.000Z',
      mimeType: asset.mimeType,
    }),
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/user/media-assets/asset-1/access?disposition=preview'),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.access.url, 'https://example.com/signed');
  assert.equal(body.access.disposition, 'preview');
});

test('GET /api/user/media-assets/[assetId]/access rejects invalid disposition', async () => {
  const handlers = createMediaAssetAccessRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    createAccessUrl: async () => {
      throw new Error('should not run');
    },
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/user/media-assets/asset-1/access?disposition=bad'),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'invalid_request');
});

test('GET /api/user/media-assets/[assetId]/access returns not found for missing asset', async () => {
  const handlers = createMediaAssetAccessRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getSavedAsset: async () => null,
    createAccessUrl: async () => {
      throw new Error('should not run');
    },
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/user/media-assets/asset-1/access?disposition=download'),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'asset_not_found');
});
