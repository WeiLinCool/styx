import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMyAssetsView } from './my-assets-state';

const assets = [
  { id: '1', kind: 'image', title: 'Stone Bird', sourceType: 'ai_generated', savedAt: '2026-06-03T10:00:00.000Z' },
  { id: '2', kind: 'video', title: 'River Clip', sourceType: 'user_uploaded', savedAt: '2026-06-01T10:00:00.000Z' },
  { id: '3', kind: 'image', title: 'Forest Stone', sourceType: 'ai_generated', savedAt: '2026-06-02T10:00:00.000Z' },
] as const;

test('deriveMyAssetsView filters by search and kind then sorts newest first', () => {
  const result = deriveMyAssetsView(assets as never, {
    search: 'st',
    kind: 'image',
    sourceType: 'all',
    sort: 'newest',
  });

  assert.deepEqual(
    result.map((asset) => asset.id),
    ['1', '3'],
  );
});

test('deriveMyAssetsView sorts oldest first when requested', () => {
  const result = deriveMyAssetsView(assets as never, {
    search: '',
    kind: 'all',
    sourceType: 'all',
    sort: 'oldest',
  });

  assert.deepEqual(
    result.map((asset) => asset.id),
    ['2', '3', '1'],
  );
});

test('deriveMyAssetsView filters by source type', () => {
  const result = deriveMyAssetsView(assets as never, {
    search: '',
    kind: 'all',
    sourceType: 'user_uploaded',
    sort: 'newest',
  });

  assert.deepEqual(
    result.map((asset) => asset.id),
    ['2'],
  );
});
