import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRawRequestBodyHash,
  buildProtectionHeaders,
} from '@/server/request-security';
import { createUserApiClient } from '@/lib/user-api-client';
import { AccountDomainError } from '@/server/auth/account-types';
import { createLoginHandler } from './route';

test('POST accepts inviteCode and forwards it to registerOrLoginUser', async () => {
  const receivedInputs: Array<{
    phone: string;
    password: string;
    displayName?: string | null;
    email?: string | null;
    inviteCode?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
  }> = [];

  const POST = createLoginHandler(async (input) => {
    receivedInputs.push(input);

    const now = new Date('2026-01-01T00:00:00.000Z');
    return {
      user: {
        id: 'user-1',
        displayName: 'Test User',
        phone: input.phone,
        email: input.email ?? null,
        avatarUrl: null,
        accountState: 'active',
        activatedAt: now,
        suspendedAt: null,
        archivedAt: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
      token: 'token-1',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  });

  const requestBody = JSON.stringify({
    phone: '13800000000',
    password: 'secret123',
    inviteCode: 'INVITE123',
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('user-agent', 'route-test');
  headers.set('x-forwarded-for', '127.0.0.1');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));

  const client = createUserApiClient({
    fetch: async () =>
      POST(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers,
          body: requestBody,
        }),
      ),
    collectBrowserFingerprint: () => null,
  });
  const response = await client.request('/api/auth/login');

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(receivedInputs[0]?.inviteCode, 'INVITE123');
  assert.equal(receivedInputs[0]?.userAgent, 'route-test');
  assert.equal(receivedInputs[0]?.ipAddress, '127.0.0.1');
});

test('POST returns account domain errors raised inside protected login operation', async () => {
  const POST = createLoginHandler(async () => {
    throw new AccountDomainError(
      'password_setup_required',
      '当前账号尚未设置密码，请先设置密码后再登录。',
      403,
    );
  });

  const requestBody = JSON.stringify({
    phone: '13800000000',
    password: 'secret123',
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));

  const response = await POST(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error?.code, 'password_setup_required');
});
