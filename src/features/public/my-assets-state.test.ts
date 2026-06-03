import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMyAssetsView } from './my-assets-state';

const assets = [
  { id: '1', kind: 'image', title: 'Stone Bird', savedAt: '2026-06-03T10:00:00.000Z' },
  { id: '2', kind: 'video', title: 'River Clip', savedAt: '2026-06-01T10:00:00.000Z' },
  { id: '3', kind: 'image', title: 'Forest Stone', savedAt: '2026-06-02T10:00:00.000Z' },
] as const;

test('deriveMyAssetsView filters by search and kind then sorts newest first', () => {
  const result = deriveMyAssetsView(assets as never, {
    search: 'st',
    kind: 'image',
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
    sort: 'oldest',
  });

  assert.deepEqual(
    result.map((asset) => asset.id),
    ['2', '3', '1'],
  );
});
