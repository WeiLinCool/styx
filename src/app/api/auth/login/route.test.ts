import assert from 'node:assert/strict';
import test from 'node:test';

import { createLoginHandler } from './route';

test('POST accepts inviteCode and forwards it to registerOrLoginUser', async () => {
  let receivedInput: {
    phone: string;
    password: string;
    displayName?: string | null;
    email?: string | null;
    inviteCode?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
  } | null = null;

  const POST = createLoginHandler(async (input) => {
    receivedInput = input;

    return {
      user: {
        id: 'user-1',
        displayName: 'Test User',
        phone: input.phone,
        email: input.email ?? null,
        accountState: 'active',
        metadata: {},
      },
      token: 'token-1',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  });

  const response = await POST(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'route-test',
        'x-forwarded-for': '127.0.0.1',
      },
      body: JSON.stringify({
        phone: '13800000000',
        password: 'secret123',
        inviteCode: 'INVITE123',
      }),
    }),
  );

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(receivedInput?.inviteCode, 'INVITE123');
  assert.equal(receivedInput?.userAgent, 'route-test');
  assert.equal(receivedInput?.ipAddress, '127.0.0.1');
});
