import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryServerCache } from '@/server/cache/server-cache';
import {
  consumeCheckinVerificationToken,
  createHumanVerificationToken,
} from './checkin-challenge';

test('human verification token is scoped by user and consumed once', async () => {
  const cache = createMemoryServerCache();
  const token = await createHumanVerificationToken({
    cache,
    userId: 'user-1',
    createId: () => 'token-1',
    now: () => new Date('2026-06-02T00:00:00.000Z'),
  });

  assert.equal(token, 'token-1');
  assert.equal(
    await consumeCheckinVerificationToken({ cache, userId: 'user-2', token }),
    false,
  );
  assert.equal(
    await consumeCheckinVerificationToken({ cache, userId: 'user-1', token }),
    true,
  );
  assert.equal(
    await consumeCheckinVerificationToken({ cache, userId: 'user-1', token }),
    false,
  );

  const nextToken = await createHumanVerificationToken({
    cache,
    userId: 'user-1',
    createId: () => 'token-2',
  });

  assert.equal(
    await consumeCheckinVerificationToken({ cache, userId: 'user-1', token: nextToken }),
    true,
  );
  assert.equal(
    await consumeCheckinVerificationToken({ cache, userId: 'user-1', token: nextToken }),
    false,
  );
});
