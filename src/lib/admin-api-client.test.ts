import assert from 'node:assert/strict';
import test from 'node:test';
import sodium from 'libsodium-wrappers-sumo';

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

test('admin client encrypts mutation bodies with configured v2 public key', async () => {
  await sodium.ready;
  const keyPair = sodium.crypto_box_keypair();
  const originalPublicKey = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL;
  const originalKeyId = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID;
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL = encodeBase64Url(keyPair.publicKey);
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID = 'admin-client-test-key';
  const calls: RequestInit[] = [];
  const client = createAdminApiClient({
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  });

  try {
    await client.request('/api/admin/users/user-1/points', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 10, reason: 'manual adjustment' }),
    });

    const sentBody = JSON.parse(calls[0]?.body as string);
    assert.equal(sentBody.encrypted, true);
    assert.equal(sentBody.v, 2);
    assert.equal(sentBody.kid, 'admin-client-test-key');
    assert.equal(typeof sentBody.ciphertext, 'string');
  } finally {
    restoreEnv('NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL', originalPublicKey);
    restoreEnv('NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID', originalKeyId);
  }
});

function encodeBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
