import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInviteUrl, formatBusinessDateInShanghai } from '@/server/points/service';
import { parseDailyCheckinBody } from './route';

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

test('parseDailyCheckinBody requires a verification token', () => {
  assert.deepEqual(parseDailyCheckinBody({ verificationToken: 'token-1' }), {
    verificationToken: 'token-1',
  });

  assert.throws(() => parseDailyCheckinBody(null), /expected object/);
  assert.throws(() => parseDailyCheckinBody({}), /verificationToken/);
});
