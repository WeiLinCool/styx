import assert from 'node:assert/strict';
import test from 'node:test';

import { createPublicMediaShareRouteHandlers } from './route';

test('GET /api/public/media-share/[shareId] returns public share payload', async () => {
  const handlers = createPublicMediaShareRouteHandlers({
    getSharedMedia: async (shareId) => ({
      asset: {
        id: 'asset-1',
        title: 'Shared image',
        kind: 'image',
        mimeType: 'image/png',
        byteSize: 128,
        width: 64,
        height: 64,
        durationSeconds: null,
        shareId,
        shareStatus: 'active',
      },
      access: {
        url: 'https://signed.example/object',
        expiresAt: '2026-06-04T10:10:00.000Z',
      },
    }),
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/public/media-share/share-1'),
    { params: Promise.resolve({ shareId: 'share-1' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.asset.id, 'asset-1');
  assert.equal(body.access.url, 'https://signed.example/object');
});

test('GET /api/public/media-share/[shareId] returns not found for missing share', async () => {
  const handlers = createPublicMediaShareRouteHandlers({
    getSharedMedia: async () => null,
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/public/media-share/missing'),
    { params: Promise.resolve({ shareId: 'missing' }) },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'share_not_found');
});
