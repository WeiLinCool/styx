import assert from 'node:assert/strict';
import test from 'node:test';

import { readJsonResponse } from './api-response';
import { encryptResponseBody } from './request-encryption';

test('readJsonResponse decrypts encrypted response envelopes', async () => {
  const encrypted = await encryptResponseBody({ ok: true, user: { id: 'user-1' } });
  const response = new Response(JSON.stringify(encrypted), {
    headers: { 'content-type': 'application/json' },
  });

  const payload = await readJsonResponse(response);

  assert.deepEqual(payload, { ok: true, user: { id: 'user-1' } });
});
