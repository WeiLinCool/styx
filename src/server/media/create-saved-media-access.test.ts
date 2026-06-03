import assert from 'node:assert/strict';
import test from 'node:test';

import { createSavedMediaAccessService } from './create-saved-media-access';

test('createSavedMediaAccessService signs preview access for owned asset', async () => {
  const service = createSavedMediaAccessService({
    signObjectUrl: async ({ objectKey, disposition }) => ({
      url: `https://example.com/${objectKey}?disposition=${disposition}`,
      expiresAt: '2026-06-03T01:00:00.000Z',
    }),
  });

  const access = await service.createAccessUrl({
    asset: {
      id: 'asset-1',
      objectKey: 'folder/file.png',
      mimeType: 'image/png',
      title: 'asset title',
    },
    disposition: 'preview',
  });

  assert.equal(access.url, 'https://example.com/folder/file.png?disposition=preview');
  assert.equal(access.disposition, 'preview');
  assert.equal(access.mimeType, 'image/png');
});

test('createSavedMediaAccessService signs download access for owned asset', async () => {
  const service = createSavedMediaAccessService({
    signObjectUrl: async ({ objectKey, disposition, title }) => ({
      url: `https://example.com/${objectKey}?disposition=${disposition}&title=${encodeURIComponent(title)}`,
      expiresAt: '2026-06-03T01:00:00.000Z',
    }),
  });

  const access = await service.createAccessUrl({
    asset: {
      id: 'asset-2',
      objectKey: 'folder/file.mp4',
      mimeType: 'video/mp4',
      title: 'video title',
    },
    disposition: 'download',
  });

  assert.equal(access.disposition, 'download');
  assert.equal(access.url, 'https://example.com/folder/file.mp4?disposition=download&title=video%20title');
});
