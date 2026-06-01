import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptRequestBody,
  encryptRequestBody,
  isEncryptedRequestEnvelope,
} from './request-encryption';
import { createUserApiClient } from './user-api-client';

test('request encryption round-trips plaintext bodies', async () => {
  const plaintext = JSON.stringify({ phone: '13800000000', password: 'secret' });
  const envelope = JSON.parse(await encryptRequestBody(plaintext));

  assert.equal(isEncryptedRequestEnvelope(envelope), true);
  if (isEncryptedRequestEnvelope(envelope)) {
    assert.equal(await decryptRequestBody(envelope), plaintext);
  }
});

test('request encryption produces ciphertext that differs from plaintext', async () => {
  const plaintext = JSON.stringify({ phone: '13800000000', password: 'secret' });
  const envelopeJson = await encryptRequestBody(plaintext);

  assert.equal(envelopeJson.includes(plaintext), false);
});

test('request body hash stays stable for equivalent JSON object shapes', async () => {
  const captured: RequestInit[] = [];
  const client = createUserApiClient({
    fetch: async (_input, init) => {
      captured.push(init ?? {});
      return Response.json({ ok: true });
    },
    collectBrowserFingerprint: () => null,
  });

  await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ b: 2, a: 1 }),
  });

  await client.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ a: 1, b: 2 }),
  });

  const first = new Headers(captured[0]?.headers).get('x-request-body-hash');
  const second = new Headers(captured[1]?.headers).get('x-request-body-hash');
  assert.equal(first, second);
});
