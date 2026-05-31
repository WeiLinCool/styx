import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInviteUrl, formatBusinessDateInShanghai } from '@/server/points/service';

test('formatBusinessDateInShanghai resolves Shanghai business date across UTC day boundary', () => {
  assert.equal(
    formatBusinessDateInShanghai(new Date('2026-05-30T15:59:59.000Z')),
    '2026-05-30',
  );

  assert.equal(
    formatBusinessDateInShanghai(new Date('2026-05-30T16:00:00.000Z')),
    '2026-05-31',
  );
});

test('buildInviteUrl appends invite code on the registration landing path', () => {
  assert.equal(
    buildInviteUrl('https://example.com', 'ABCD1234'),
    'https://example.com/home?invite=ABCD1234',
  );
});
