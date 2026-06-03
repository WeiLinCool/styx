import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaAssetsRouteHandlers } from './route';

test('POST /api/user/media-assets saves a generated artifact for the current user', async () => {
  const handlers = createMediaAssetsRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    saveGeneratedMedia: async ({ userId, runId, artifactId }) => ({
      asset: {
        id: 'asset-1',
        userId,
        runId,
        conversationId: 'conversation-1',
        artifactId,
        kind: 'image',
        title: '生成图片',
        sourceProvider: 'doubao',
        sourceModel: 'seedream-3',
        sourceUrl: 'https://provider.example/output.png',
        sourceExpiresAt: '2026-06-03T12:00:00.000Z',
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
        updatedAt: '2026-06-03T12:00:01.000Z',
      },
      updatedArtifact: {
        id: artifactId,
        kind: 'image',
        title: '生成图片',
        status: 'ready',
        body: null,
        url: null,
        metadata: { saveStatus: 'saved', savedAssetId: 'asset-1' },
        createdAt: '2026-06-03T12:00:00.000Z',
      },
    }),
    listSavedAssets: async () => [],
  });

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runId: '11111111-1111-4111-8111-111111111111',
        artifactId: '22222222-2222-4222-8222-222222222222',
      }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.runId, '11111111-1111-4111-8111-111111111111');
  assert.equal(body.artifact.metadata.saveStatus, 'saved');
});

test('GET /api/user/media-assets lists saved assets for the current user', async () => {
  const handlers = createMediaAssetsRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    saveGeneratedMedia: async () => {
      throw new Error('should not be called');
    },
    listSavedAssets: async (userId) => [
      {
        id: 'asset-1',
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
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-03T12:00:00.000Z',
        savedAt: '2026-06-03T12:00:01.000Z',
        deletedAt: null,
        createdAt: '2026-06-03T12:00:00.000Z',
        updatedAt: '2026-06-03T12:00:01.000Z',
      },
    ],
  });

  const response = await handlers.GET();

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.assets.length, 1);
  assert.equal(body.assets[0].id, 'asset-1');
});
