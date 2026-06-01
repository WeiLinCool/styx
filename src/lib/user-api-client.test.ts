import assert from 'node:assert/strict';
import test from 'node:test';

import { createUserApiClient } from './user-api-client';

test('user client dedupes identical in-flight GET requests', async () => {
  let fetchCount = 0;
  const client = createUserApiClient({
    fetch: async () => {
      fetchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ ok: true });
    },
  });

  const [first, second] = await Promise.all([
    client.request('/api/auth/me', { cache: 'no-store' }),
    client.request('/api/auth/me', { cache: 'no-store' }),
  ]);

  assert.equal(fetchCount, 1);
  assert.notEqual(first, second);
  assert.deepEqual(await first.json(), { ok: true });
  assert.deepEqual(await second.json(), { ok: true });
});

test('user client emits idempotency metadata for mutations', async () => {
  const calls: RequestInit[] = [];
  const client = createUserApiClient({
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  });

  await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13800000000', password: 'secret' }),
  });

  const headers = new Headers(calls[0]?.headers);
  assert.equal((headers.get('Idempotency-Key')?.length ?? 0) > 0, true);
  assert.equal((headers.get('x-request-body-hash')?.length ?? 0) > 0, true);
  assert.equal((headers.get('x-request-id')?.length ?? 0) > 0, true);
  assert.equal((headers.get('x-client-timestamp')?.length ?? 0) > 0, true);
  assert.equal((headers.get('x-request-nonce')?.length ?? 0) > 0, true);
});

test('user client emits injected browser fingerprint metadata for mutations only', async () => {
  const calls: RequestInit[] = [];
  const client = createUserApiClient({
    collectBrowserFingerprint: () => ({
      colorDepth: 24,
      hardwareConcurrency: 8,
      language: 'zh-CN',
      platform: 'MacIntel',
      screen: { height: 1080, width: 1920 },
      timezone: 'Asia/Shanghai',
      userAgent: 'test-browser',
    }),
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  });

  await client.request('/api/auth/me', { cache: 'no-store' });
  await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13800000000', password: 'secret' }),
  });

  assert.equal(new Headers(calls[0]?.headers).get('x-browser-fingerprint'), null);
  const mutationHeaders = new Headers(calls[1]?.headers);
  assert.equal((mutationHeaders.get('x-browser-fingerprint')?.length ?? 0) > 0, true);
  assert.equal(mutationHeaders.get('x-browser-fingerprint-source'), 'client');
});
