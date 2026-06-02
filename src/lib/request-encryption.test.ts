import assert from 'node:assert/strict';
import test from 'node:test';
import sodium from 'libsodium-wrappers-sumo';

import {
  REQUEST_ENCRYPTION_ALGORITHM_V2,
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

test('request encryption supports v2 libsodium sealed-box envelopes', async () => {
  await sodium.ready;
  const keyPair = sodium.crypto_box_keypair();
  const plaintext = JSON.stringify({ phone: '13800000000', password: 'secret' });

  const envelope = JSON.parse(
    await encryptRequestBody(plaintext, {
      keyId: 'test-key',
      publicKeyB64Url: encodeBase64Url(keyPair.publicKey),
    }),
  );

  assert.equal(envelope.encrypted, true);
  assert.equal(envelope.v, 2);
  assert.equal(envelope.alg, REQUEST_ENCRYPTION_ALGORITHM_V2);
  assert.equal(envelope.kid, 'test-key');
  assert.equal(typeof envelope.ciphertext, 'string');
  assert.equal(envelope.ciphertext.includes(plaintext), false);
  assert.equal(
    await decryptRequestBody(envelope, {
      keyId: 'test-key',
      publicKeyB64Url: encodeBase64Url(keyPair.publicKey),
      privateKeyB64Url: encodeBase64Url(keyPair.privateKey),
    }),
    plaintext,
  );
});

test('request encryption falls back to plaintext when Web Crypto is unavailable', async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {},
  });

  try {
    const plaintext = JSON.stringify({ phone: '13800000000', password: 'secret' });
    assert.equal(await encryptRequestBody(plaintext), plaintext);
  } finally {
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    }
  }
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

function encodeBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
