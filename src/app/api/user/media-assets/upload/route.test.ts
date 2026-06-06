import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaAssetUploadRouteHandlers } from './route';

test('POST /api/user/media-assets/upload uploads a user image asset', async () => {
  const handlers = createMediaAssetUploadRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: false,
    }),
    uploadMedia: async ({ userId, title, filename, mimeType, bytes }) => ({
      asset: {
        id: 'asset-1',
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
        originalFilename: filename,
        sha256: 'sha256-1',
        shareId: null,
        shareStatus: 'disabled',
        sharedAt: null,
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'key',
        mimeType,
        byteSize: bytes.byteLength,
        width: null,
        height: null,
        durationSeconds: null,
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-04T10:00:00.000Z',
        savedAt: '2026-06-04T10:00:00.000Z',
        deletedAt: null,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T10:00:00.000Z',
      },
    }),
  });

  const formData = new FormData();
  formData.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
  formData.set('title', 'My upload');

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets/upload', {
      method: 'POST',
      body: formData,
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.sourceType, 'user_uploaded');
  assert.equal(body.asset.originalFilename, 'photo.png');
});

test('POST /api/user/media-assets/upload uploads a user audio asset', async () => {
  const handlers = createMediaAssetUploadRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: false,
    }),
    uploadMedia: async ({ userId, title, filename, mimeType, bytes }) => ({
      asset: {
        id: 'asset-audio-1',
        userId,
        runId: null,
        conversationId: null,
        artifactId: null,
        kind: 'audio',
        title,
        sourceType: 'user_uploaded',
        sourceProvider: null,
        sourceModel: null,
        sourceUrl: null,
        sourceExpiresAt: null,
        originalFilename: filename,
        sha256: 'sha256-audio',
        shareId: null,
        shareStatus: 'disabled',
        sharedAt: null,
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'key',
        mimeType,
        byteSize: bytes.byteLength,
        width: null,
        height: null,
        durationSeconds: null,
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-04T10:00:00.000Z',
        savedAt: '2026-06-04T10:00:00.000Z',
        deletedAt: null,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T10:00:00.000Z',
      },
    }),
  });

  const formData = new FormData();
  formData.set('file', new File([new Uint8Array([1, 2, 3])], 'song.mp3', { type: 'audio/mpeg' }));
  formData.set('title', 'Song');

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets/upload', {
      method: 'POST',
      body: formData,
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.asset.kind, 'audio');
  assert.equal(body.asset.mimeType, 'audio/mpeg');
  assert.equal(body.asset.sourceType, 'user_uploaded');
  assert.equal(body.asset.originalFilename, 'song.mp3');
});

test('POST /api/user/media-assets/upload rejects missing file', async () => {
  const handlers = createMediaAssetUploadRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: false,
    }),
    uploadMedia: async () => {
      throw new Error('should not be called');
    },
  });

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets/upload', {
      method: 'POST',
      body: new FormData(),
    }),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'invalid_request');
  assert.match(body.error.message, /音频/);
});

test('POST /api/user/media-assets/upload rejects users without upload permission', async () => {
  const handlers = createMediaAssetUploadRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    resolveMediaPolicy: async () => ({
      storageQuotaBytes: 0,
      allowUserUpload: false,
      allowPublicSharing: false,
    }),
    uploadMedia: async () => {
      throw new Error('should not be called');
    },
  });

  const formData = new FormData();
  formData.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));

  const response = await handlers.POST(
    new Request('https://example.com/api/user/media-assets/upload', {
      method: 'POST',
      body: formData,
    }),
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, 'membership_media_upload_forbidden');
});
