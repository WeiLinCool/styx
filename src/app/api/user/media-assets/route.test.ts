import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountDomainError } from '@/server/auth/account-types';
import { encryptRequestBody } from '@/lib/request-encryption';
import { buildStableRequestBodyHash } from '@/server/request-security';
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
        sourceType: 'ai_generated',
        sourceProvider: 'doubao',
        sourceModel: 'seedream-3',
        sourceUrl: 'https://provider.example/output.png',
        sourceExpiresAt: '2026-06-03T12:00:00.000Z',
        originalFilename: null,
        sha256: null,
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
      headers: {
        'content-type': 'application/json',
        'x-request-id': '20a64df4-8999-432e-a94d-458bd2889373',
        'x-request-nonce': '8e4da50c-339e-4571-ba8e-b31f1648497c',
        'x-client-timestamp': String(Date.now()),
        'x-request-body-hash': buildStableRequestBodyHash({
          runId: '11111111-1111-4111-8111-111111111111',
          artifactId: '22222222-2222-4222-8222-222222222222',
        }),
        'idempotency-key': 'user:ea8159dd-819d-40cb-8503-bb7acb81ce5c',
      },
      body: JSON.stringify({
        runId: '11111111-1111-4111-8111-111111111111',
        artifactId: '22222222-2222-4222-8222-222222222222',
      }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.runId, '11111111-1111-4111-8111-111111111111');
  assert.equal(body.asset.sourceType, 'ai_generated');
  assert.equal(body.asset.shareStatus, 'disabled');
  assert.equal(body.artifact.metadata.saveStatus, 'saved');
});

test('POST /api/user/media-assets accepts encrypted request bodies', async () => {
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
        sourceType: 'ai_generated',
        sourceProvider: 'doubao',
        sourceModel: 'seedream-3',
        sourceUrl: 'https://provider.example/output.png',
        sourceExpiresAt: '2026-06-03T12:00:00.000Z',
        originalFilename: null,
        sha256: null,
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

  const payload = {
    runId: '11111111-1111-4111-8111-111111111111',
    artifactId: '22222222-2222-4222-8222-222222222222',
  };
  const encryptedBody = await encryptRequestBody(JSON.stringify(payload));

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': '20a64df4-8999-432e-a94d-458bd2889373',
        'x-request-nonce': '8e4da50c-339e-4571-ba8e-b31f1648497c',
        'x-client-timestamp': String(Date.now()),
        'x-request-body-hash': buildStableRequestBodyHash(payload),
        'idempotency-key': 'user:ea8159dd-819d-40cb-8503-bb7acb81ce5c',
      },
      body: encryptedBody,
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.id, 'asset-1');
  assert.equal(body.artifact.metadata.savedAssetId, 'asset-1');
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
        sourceType: 'ai_generated',
        sourceProvider: 'doubao',
        sourceModel: 'seedream-3',
        sourceUrl: null,
        sourceExpiresAt: null,
        originalFilename: null,
        sha256: null,
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

test('GET /api/user/media-assets returns permission_denied when session guard rejects access', async () => {
  const handlers = createMediaAssetsRouteHandlers({
    requireSession: async () => {
      throw new AccountDomainError('permission_denied', 'Permission denied: api.user.media_assets.list', 403);
    },
    saveGeneratedMedia: async () => {
      throw new Error('should not be called');
    },
    listSavedAssets: async () => [],
  });

  const response = await handlers.GET();
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'permission_denied');
});
