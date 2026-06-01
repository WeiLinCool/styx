import assert from 'node:assert/strict';
import test from 'node:test';

import { createUserApiClient } from '@/lib/user-api-client';
import { readJsonBody } from './api-request-guard';

test('user mutation request body is encrypted before fetch and decrypted on the server', async () => {
  let capturedInit: RequestInit | undefined;
  const client = createUserApiClient({
    fetch: async (_input, init) => {
      capturedInit = init;
      return Response.json({ ok: true });
    },
    collectBrowserFingerprint: () => null,
  });

  const plaintext = JSON.stringify({ phone: '13800000000', password: 'secret' });
  await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: plaintext,
  });

  const body = String(capturedInit?.body ?? '');
  assert.equal(body.includes(plaintext), false);

  const request = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: capturedInit?.headers,
    body,
  });
  const parsed = await readJsonBody(request);
  assert.deepEqual(parsed.body, { phone: '13800000000', password: 'secret' });
});
