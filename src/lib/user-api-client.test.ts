import assert from 'node:assert/strict';
import test from 'node:test';
import sodium from 'libsodium-wrappers-sumo';

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

test('user client encrypts mutation bodies with configured v2 public key', async () => {
  await sodium.ready;
  const keyPair = sodium.crypto_box_keypair();
  const originalPublicKey = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL;
  const originalKeyId = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID;
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL = encodeBase64Url(keyPair.publicKey);
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID = 'client-test-key';
  const calls: RequestInit[] = [];
  const client = createUserApiClient({
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json({ ok: true });
    },
  });

  try {
    await client.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '13800000000', password: 'secret' }),
    });

    const sentBody = JSON.parse(calls[0]?.body as string);
    assert.equal(sentBody.encrypted, true);
    assert.equal(sentBody.v, 2);
    assert.equal(sentBody.kid, 'client-test-key');
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
