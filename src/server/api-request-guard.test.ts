import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';

import { buildProtectionHeaders, buildRawRequestBodyHash } from './request-security';
import { readJsonBody, runProtectedMutation } from './api-request-guard';
import { encryptRequestBody } from '@/lib/request-encryption';

test('idempotent replay strips transient artifact data URLs without changing the live response', async () => {
  const requestBody = { prompt: 'stone cat' };
  const headers = buildProtectionHeaders({
    body: requestBody,
    fingerprint: 'fp-user',
    idempotencyKey: `transient-artifact-${randomUUID()}`,
  });
  const context = {
    request: new Request('http://localhost/api/agent/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    }),
    routeKind: 'user-mutation' as const,
    operation: 'POST /api/agent/runs',
    actorType: 'user' as const,
    actorId: 'user-1',
    rawBody: JSON.stringify(requestBody),
    parsedBody: requestBody,
  };
  const liveBody = {
    run: { id: 'run-1', status: 'succeeded' },
    transientArtifacts: [
      {
        kind: 'image',
        title: 'Generated image',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,SHOULD_NOT_PERSIST',
        metadata: {
          transient: true,
          nested: {
            dataUrl: 'data:image/png;base64,NESTED_SHOULD_NOT_PERSIST',
          },
        },
      },
    ],
    ordinary: {
      dataUrl: 'data:application/json;base64,ORDINARY_RESPONSE_FIELD',
    },
  };
  let calls = 0;

  const first = await runProtectedMutation(context, async () => {
    calls += 1;
    return Response.json(liveBody);
  });
  const firstBody = await first.json();

  const replay = await runProtectedMutation(context, async () => {
    calls += 1;
    return Response.json({ ok: false });
  });
  const replayBody = await replay.json();

  assert.equal(calls, 1);
  assert.equal(firstBody.transientArtifacts[0].dataUrl, 'data:image/png;base64,SHOULD_NOT_PERSIST');
  assert.equal(
    firstBody.transientArtifacts[0].metadata.nested.dataUrl,
    'data:image/png;base64,NESTED_SHOULD_NOT_PERSIST',
  );
  assert.equal(firstBody.ordinary.dataUrl, 'data:application/json;base64,ORDINARY_RESPONSE_FIELD');
  assert.equal(replay.headers.get('x-idempotency-replayed'), 'true');
  assert.equal('dataUrl' in replayBody.transientArtifacts[0], false);
  assert.equal('dataUrl' in replayBody.transientArtifacts[0].metadata.nested, false);
  assert.equal(replayBody.ordinary.dataUrl, 'data:application/json;base64,ORDINARY_RESPONSE_FIELD');
});

test('readJsonBody decrypts v2 sealed-box request envelopes with server env keys', async () => {
  await sodium.ready;
  const keyPair = sodium.crypto_box_keypair();
  const publicKey = encodeBase64Url(keyPair.publicKey);
  const privateKey = encodeBase64Url(keyPair.privateKey);
  const originalPublicKey = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL;
  const originalPrivateKey = process.env.STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL;
  const originalKeyId = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID;
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL = publicKey;
  process.env.STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL = privateKey;
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID = 'test-key';

  try {
    const body = { phone: '13800000000', password: 'secret' };
    const plaintext = JSON.stringify(body);
    const encryptedBody = await encryptRequestBody(plaintext, {
      keyId: 'test-key',
      publicKeyB64Url: publicKey,
    });

    const result = await readJsonBody(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: encryptedBody,
      }),
    );

    assert.deepEqual(result.body, body);
    assert.equal(result.rawBody, encryptedBody);
    assert.equal(result.decryptedRawBody, plaintext);
  } finally {
    restoreEnv('NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL', originalPublicKey);
    restoreEnv('STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL', originalPrivateKey);
    restoreEnv('NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID', originalKeyId);
  }
});

test('runProtectedMutation validates body hash against decrypted sealed-box plaintext', async () => {
  await sodium.ready;
  const keyPair = sodium.crypto_box_keypair();
  const publicKey = encodeBase64Url(keyPair.publicKey);
  const privateKey = encodeBase64Url(keyPair.privateKey);
  const originalPublicKey = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL;
  const originalPrivateKey = process.env.STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL;
  const originalKeyId = process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID;
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL = publicKey;
  process.env.STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL = privateKey;
  process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID = 'test-key';

  try {
    const body = { phone: '13800000000', password: 'secret' };
    const plaintext = JSON.stringify(body);
    const encryptedBody = await encryptRequestBody(plaintext, {
      keyId: 'test-key',
      publicKeyB64Url: publicKey,
    });
    const headers = buildProtectionHeaders({
      body: { encrypted: true },
      fingerprint: 'fp-user',
      idempotencyKey: `sealed-${randomUUID()}`,
    });
    headers.set('x-request-body-hash', buildRawRequestBodyHash(plaintext));
    const parsed = await readJsonBody(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: encryptedBody,
      }),
    );

    const response = await runProtectedMutation(
      {
        request: new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers,
          body: encryptedBody,
        }),
        routeKind: 'sensitive-user-mutation',
        operation: 'POST /api/auth/login',
        actorType: 'anonymous',
        actorId: body.phone,
        rawBody: parsed.rawBody,
        decryptedRawBody: parsed.decryptedRawBody,
        parsedBody: parsed.body,
      },
      async () => Response.json({ ok: true }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    restoreEnv('NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL', originalPublicKey);
    restoreEnv('STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL', originalPrivateKey);
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
