import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminApiClient } from './admin-api-client';

test('admin client does not dedupe identical GET requests by default', async () => {
  let fetchCount = 0;
  const client = createAdminApiClient({
    fetch: async () => {
      fetchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ ok: true });
    },
  });

  await Promise.all([
    client.request('/api/admin/dashboard', { cache: 'no-store' }),
    client.request('/api/admin/dashboard', { cache: 'no-store' }),
  ]);

  assert.equal(fetchCount, 2);
});

test('admin client emits admin idempotency metadata for mutations', async () => {
  const calls: RequestInit[] = [];
  const client = createAdminApiClient({
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  });

  await client.request('/api/admin/users/user-1/points', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 10, reason: 'manual adjustment' }),
  });

  const headers = new Headers(calls[0]?.headers);
  assert.equal((headers.get('Idempotency-Key')?.length ?? 0) > 0, true);
  assert.match(headers.get('Idempotency-Key') ?? '', /^admin:/);
  assert.equal((headers.get('x-request-body-hash')?.length ?? 0) > 0, true);
  assert.equal(headers.get('x-api-client'), 'admin');
});
