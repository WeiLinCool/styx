import assert from 'node:assert/strict';
import test from 'node:test';

import { readJsonResponse } from './api-response';
import { encryptResponseBody } from './request-encryption';
import { createJsonResponse } from '@/server/encrypted-response';

test('readJsonResponse decrypts encrypted response envelopes', async () => {
  const encrypted = await encryptResponseBody({ ok: true, user: { id: 'user-1' } });
  const response = new Response(JSON.stringify(encrypted), {
    headers: { 'content-type': 'application/json' },
  });

  const payload = await readJsonResponse(response);

  assert.deepEqual(payload, { ok: true, user: { id: 'user-1' } });
});

test('createJsonResponse returns plaintext JSON in insecure transport mode', async () => {
  const originalMode = process.env.STYX_TRANSPORT_SECURITY_MODE;
  process.env.STYX_TRANSPORT_SECURITY_MODE = 'insecure';

  try {
    const response = await createJsonResponse({ ok: true });
    const payload = await response.json();

    assert.deepEqual(payload, { ok: true });
  } finally {
    if (originalMode === undefined) {
      delete process.env.STYX_TRANSPORT_SECURITY_MODE;
    } else {
      process.env.STYX_TRANSPORT_SECURITY_MODE = originalMode;
    }
  }
});
