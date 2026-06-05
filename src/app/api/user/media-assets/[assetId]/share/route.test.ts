import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaAssetShareRouteHandlers } from './route';

test('POST /api/user/media-assets/[assetId]/share enables sharing for owned asset', async () => {
  const handlers = createMediaAssetShareRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: true,
    }),
    enableShare: async (assetId, userId) => ({
      asset: {
        id: assetId,
        userId,
        runId: null,
        conversationId: null,
        artifactId: null,
        kind: 'image',
        title: 'Share me',
        sourceType: 'user_uploaded',
        sourceProvider: null,
        sourceModel: null,
        sourceUrl: null,
        sourceExpiresAt: null,
        originalFilename: 'share.png',
        sha256: 'sha',
        shareId: 'share-1',
        shareStatus: 'active',
        sharedAt: '2026-06-04T10:00:00.000Z',
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'key',
        mimeType: 'image/png',
        byteSize: 12,
        width: 100,
        height: 100,
        durationSeconds: null,
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-04T10:00:00.000Z',
        savedAt: '2026-06-04T10:00:00.000Z',
        deletedAt: null,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T10:00:00.000Z',
      },
      share: {
        shareId: 'share-1',
        url: 'https://example.com/shared/media/share-1',
      },
    }),
    disableShare: async () => {
      throw new Error('should not run');
    },
  });

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets/asset-1/share', { method: 'POST' }),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.asset.shareStatus, 'active');
  assert.equal(body.share.url, 'https://example.com/shared/media/share-1');
});

test('DELETE /api/user/media-assets/[assetId]/share disables sharing for owned asset', async () => {
  const handlers = createMediaAssetShareRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: true,
    }),
    enableShare: async () => {
      throw new Error('should not run');
    },
    disableShare: async (assetId, userId) => ({
      id: assetId,
      userId,
      runId: null,
      conversationId: null,
      artifactId: null,
      kind: 'image',
      title: 'Share me',
      sourceType: 'user_uploaded',
      sourceProvider: null,
      sourceModel: null,
      sourceUrl: null,
      sourceExpiresAt: null,
      originalFilename: 'share.png',
      sha256: 'sha',
      shareId: 'share-1',
      shareStatus: 'disabled',
      sharedAt: '2026-06-04T10:00:00.000Z',
      storageProvider: 'tencent_cos',
      bucket: 'bucket-a',
      region: 'ap-shanghai',
      objectKey: 'key',
      mimeType: 'image/png',
      byteSize: 12,
      width: 100,
      height: 100,
      durationSeconds: null,
      status: 'ready',
      metadata: {},
      saveRequestedAt: '2026-06-04T10:00:00.000Z',
      savedAt: '2026-06-04T10:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    }),
  });

  const response = await handlers.DELETE(
    new Request('https://example.com/api/user/media-assets/asset-1/share', { method: 'DELETE' }),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.asset.shareStatus, 'disabled');
});

test('POST /api/user/media-assets/[assetId]/share rejects users without public share permission', async () => {
  const handlers = createMediaAssetShareRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: false,
    }),
    enableShare: async () => {
      throw new Error('should not run');
    },
    disableShare: async () => {
      throw new Error('should not run');
    },
  });

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets/asset-1/share', { method: 'POST' }),
    { params: Promise.resolve({ assetId: 'asset-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'membership_media_share_forbidden');
});
