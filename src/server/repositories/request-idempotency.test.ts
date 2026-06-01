import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryRequestIdempotencyStore,
  runIdempotentRequest,
} from './request-idempotency';
import { getRequestIdempotencyStore } from './request-idempotency';

test('repeated completed idempotency key returns stored response without rerunning operation', async () => {
  const store = createMemoryRequestIdempotencyStore();
  let calls = 0;
  const input = {
    actorType: 'user' as const,
    actorId: 'user-1',
    operation: 'POST /api/auth/login',
    key: 'key-1',
    bodyHash: 'hash-1',
  };

  const first = await runIdempotentRequest(store, input, async () => {
    calls += 1;
    return { status: 200, body: { ok: true, token: 'redacted' } };
  });
  const second = await runIdempotentRequest(store, input, async () => {
    calls += 1;
    return { status: 500, body: { ok: false } };
  });

  assert.equal(calls, 1);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.response, { status: 200, body: { ok: true, token: 'redacted' } });
});

test('same key with different body hash is rejected', async () => {
  const store = createMemoryRequestIdempotencyStore();
  const input = {
    actorType: 'admin' as const,
    actorId: 'admin-1',
    operation: 'POST /api/admin/users/1/points',
    key: 'key-1',
    bodyHash: 'hash-1',
  };

  await runIdempotentRequest(store, input, async () => ({ status: 200, body: { ok: true } }));

  await assert.rejects(
    () =>
      runIdempotentRequest(
        store,
        { ...input, bodyHash: 'hash-2' },
        async () => ({ status: 200, body: { ok: false } }),
      ),
    /idempotency_key_reused_with_different_body/,
  );
});

test('expired records are not replayed', async () => {
  const store = createMemoryRequestIdempotencyStore();
  let now = Date.UTC(2026, 5, 1, 12);
  let calls = 0;
  const input = {
    actorType: 'user' as const,
    actorId: 'user-1',
    operation: 'POST /api/user/points/checkin',
    key: 'key-1',
    bodyHash: 'hash-1',
    ttlMs: 1000,
    now: () => new Date(now),
  };

  await runIdempotentRequest(store, input, async () => {
    calls += 1;
    return { status: 200, body: { value: calls } };
  });
  now += 1500;
  const replay = await runIdempotentRequest(store, input, async () => {
    calls += 1;
    return { status: 200, body: { value: calls } };
  });

  assert.equal(calls, 2);
  assert.equal(replay.replayed, false);
  assert.deepEqual(replay.response.body, { value: 2 });
});

test('processing duplicates conflict predictably', async () => {
  const store = createMemoryRequestIdempotencyStore();
  const input = {
    actorType: 'admin' as const,
    actorId: 'admin-1',
    operation: 'POST /api/admin/orders/1/status',
    key: 'key-1',
    bodyHash: 'hash-1',
  };

  await store.begin(input);

  await assert.rejects(
    () => runIdempotentRequest(store, input, async () => ({ status: 200, body: { ok: true } })),
    /idempotency_request_processing/,
  );
});

test('memory store is bounded and evicts oldest completed records', async () => {
  const store = createMemoryRequestIdempotencyStore({ maxRecords: 1 });

  await runIdempotentRequest(
    store,
    {
      actorType: 'anonymous',
      actorId: null,
      operation: 'POST /api/auth/login',
      key: 'key-1',
      bodyHash: 'hash-1',
    },
    async () => ({ status: 200, body: { value: 1 } }),
  );
  await runIdempotentRequest(
    store,
    {
      actorType: 'anonymous',
      actorId: null,
      operation: 'POST /api/auth/login',
      key: 'key-2',
      bodyHash: 'hash-2',
    },
    async () => ({ status: 200, body: { value: 2 } }),
  );

  assert.equal(store.size(), 1);
});

test('idempotency store falls back when database table is missing', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/missing';
    const store = getRequestIdempotencyStore();
    assert.equal(typeof store.begin, 'function');
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
