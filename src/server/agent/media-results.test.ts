import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDirectMediaEventPayload,
  sanitizeDirectMediaArtifact,
  toDirectMediaResult,
} from './media-results';

test('toDirectMediaResult accepts provider URL media artifacts', () => {
  const result = toDirectMediaResult({
    kind: 'video',
    title: '生成视频',
    url: 'https://provider.example/result.mp4',
    metadata: {
      mimeType: 'video/mp4',
      filename: 'result.mp4',
      durationSeconds: 5,
      providerTaskId: 'task-1',
      providerExpiresAt: '2026-06-01T10:00:00.000Z',
    },
  });

  assert.equal(result?.kind, 'video');
  assert.equal(result?.delivery.mode, 'provider_url');
  assert.equal(result?.delivery.url, 'https://provider.example/result.mp4');
  assert.equal(result?.delivery.expiresAt, '2026-06-01T10:00:00.000Z');
  assert.equal(result?.metadata.storageStatus, 'provider_direct');
  assert.equal(result?.metadata.mimeType, 'video/mp4');
  assert.equal(result?.metadata.durationSeconds, 5);
});

test('toDirectMediaResult accepts expiresAt metadata fallback', () => {
  const result = toDirectMediaResult({
    kind: 'video',
    title: '生成视频',
    url: 'https://provider.example/result.mp4',
    metadata: {
      expiresAt: '2026-06-01T11:00:00.000Z',
    },
  });

  assert.equal(result?.delivery.expiresAt, '2026-06-01T11:00:00.000Z');
  const sanitized = sanitizeDirectMediaArtifact({
    kind: 'video',
    title: '生成视频',
    url: 'https://provider.example/result.mp4',
    metadata: {
      expiresAt: '2026-06-01T11:00:00.000Z',
    },
  });
  assert.equal(sanitized.metadata.providerExpiresAt, '2026-06-01T11:00:00.000Z');
});

test('toDirectMediaResult accepts data URL media artifacts', () => {
  const result = toDirectMediaResult({
    kind: 'image',
    title: '生成图片',
    body: 'data:image/svg+xml;base64,abc',
    metadata: {
      mimeType: 'image/svg+xml',
      width: 1024,
      height: 1024,
    },
  });

  assert.equal(result?.kind, 'image');
  assert.equal(result?.delivery.mode, 'data_url');
  assert.equal(result?.delivery.url, 'data:image/svg+xml;base64,abc');
  assert.equal(result?.metadata.storageStatus, 'provider_direct');
  assert.equal(result?.metadata.width, 1024);
  assert.equal(result?.metadata.height, 1024);
});

test('sanitizeDirectMediaArtifact persists no direct media body or URL', () => {
  const sanitized = sanitizeDirectMediaArtifact({
    kind: 'video',
    title: '生成视频',
    url: 'https://provider.example/result.mp4',
    metadata: {
      mimeType: 'video/mp4',
      providerExpiresAt: '2026-06-01T10:00:00.000Z',
    },
  });

  assert.equal(sanitized.kind, 'video');
  assert.equal(sanitized.body, null);
  assert.equal(sanitized.url, null);
  assert.equal(sanitized.metadata.storageStatus, 'provider_direct');
  assert.equal(sanitized.metadata.deliveryMode, 'provider_url');
  assert.equal(sanitized.metadata.providerExpiresAt, '2026-06-01T10:00:00.000Z');
  assert.equal(sanitized.metadata.sourceUrl, 'https://provider.example/result.mp4');
});

test('createDirectMediaEventPayload returns browser preview payload', () => {
  const media = toDirectMediaResult({
    kind: 'image',
    title: '生成图片',
    body: 'data:image/png;base64,abc',
    metadata: { mimeType: 'image/png', filename: 'image.png' },
  });

  assert.ok(media);
  const payload = createDirectMediaEventPayload(media);
  assert.equal(payload.artifact.kind, 'image');
  assert.equal(payload.artifact.delivery.mode, 'data_url');
  assert.equal(payload.artifact.delivery.url, 'data:image/png;base64,abc');
  assert.equal(payload.artifact.metadata.storageStatus, 'provider_direct');
});
