import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLoginBody } from './route';

test('parseLoginBody accepts inviteCode and preserves it for forwarding', () => {
  const parsed = parseLoginBody({
    phone: '13800000000',
    password: 'secret123',
    inviteCode: 'INVITE123',
  });

  assert.deepEqual(parsed, {
    phone: '13800000000',
    password: 'secret123',
    inviteCode: 'INVITE123',
  });
});
