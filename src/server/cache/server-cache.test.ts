import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryServerCache, parseRedisConfig } from './server-cache';

test('memory server cache expires values and consumes them once', async () => {
  const now = new Date('2026-06-02T00:00:00.000Z');
  const cache = createMemoryServerCache({ now: () => now });

  await cache.setJson('challenge:1', { ok: true }, 1000);

  assert.deepEqual(await cache.getJson('challenge:1'), { ok: true });
  assert.deepEqual(await cache.consumeJson('challenge:1'), { ok: true });
  assert.equal(await cache.getJson('challenge:1'), null);

  await cache.setJson('challenge:2', { ok: true }, 1000);
  now.setTime(now.getTime() + 1001);
  assert.equal(await cache.getJson('challenge:2'), null);
});

test('memory server cache lock prevents duplicate holders until release', async () => {
  const cache = createMemoryServerCache();

  const first = await cache.acquireLock('lock:user-1', 1000);
  const second = await cache.acquireLock('lock:user-1', 1000);
  await first.release();
  const third = await cache.acquireLock('lock:user-1', 1000);

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(third.acquired, true);
});

test('parseRedisConfig supports split redis environment variables', () => {
  assert.deepEqual(
    parseRedisConfig({
      STYX_REDIS_HOST: 'redis.example',
      STYX_REDIS_PORT: '10001',
      STYX_REDIS_PASSWORD: 'secret',
      STYX_REDIS_DB: '8',
      STYX_REDIS_TIMEOUT_MS: '3000',
    }),
    {
      host: 'redis.example',
      port: 10001,
      password: 'secret',
      database: 8,
      timeoutMs: 3000,
    },
  );
});
