import assert from 'node:assert/strict';
import test from 'node:test';

import { createPublicMediaShareService } from './create-public-media-share';

test('createPublicMediaShareService builds share metadata and public url', async () => {
  const service = createPublicMediaShareService({
    createShareId: () => 'share-1',
    buildShareUrl: (shareId) => `https://example.com/shared/media/${shareId}`,
    signObjectUrl: async ({ objectKey }) => ({
      url: `https://signed.example/${objectKey}`,
      expiresAt: '2026-06-04T10:10:00.000Z',
    }),
  });

  const share = service.createShareMetadata();
  assert.equal(share.shareId, 'share-1');
  assert.equal(share.url, 'https://example.com/shared/media/share-1');

  const payload = await service.createPublicPayload({
    asset: {
      id: 'asset-1',
      title: 'Shared image',
      kind: 'image',
      mimeType: 'image/png',
      objectKey: 'path/object.png',
      byteSize: 128,
      width: 64,
      height: 64,
      durationSeconds: null,
      shareId: 'share-1',
      shareStatus: 'active',
    },
  });

  assert.equal(payload.asset.id, 'asset-1');
  assert.equal(payload.access.url, 'https://signed.example/path/object.png');
});
