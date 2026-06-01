import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminApiClient } from '@/lib/admin-api-client';
import { hashAdminPassword } from '@/server/auth/admin-auth';
import { POST } from './route';

test('POST accepts encrypted admin client login requests', async () => {
  const originalSecret = process.env.STYX_ADMIN_AUTH_SECRET;
  const originalAccounts = process.env.STYX_ADMIN_ACCOUNTS_JSON;

  process.env.STYX_ADMIN_AUTH_SECRET = 'route-test-secret';
  process.env.STYX_ADMIN_ACCOUNTS_JSON = JSON.stringify([
    {
      userId: '00000000-0000-4000-8000-000000000001',
      username: 'admin',
      passwordHash: hashAdminPassword('correct-password'),
      phone: null,
      allowWhitelistBypass: true,
    },
  ]);

  try {
    const client = createAdminApiClient({
      fetch: async (input, init) =>
        POST(
          new Request(new URL(String(input), 'http://localhost'), {
            method: init?.method,
            headers: init?.headers,
            body: init?.body,
          }),
        ),
      collectBrowserFingerprint: () => null,
    });

    const response = await client.request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, 'session_required');
  } finally {
    if (originalSecret === undefined) {
      delete process.env.STYX_ADMIN_AUTH_SECRET;
    } else {
      process.env.STYX_ADMIN_AUTH_SECRET = originalSecret;
    }

    if (originalAccounts === undefined) {
      delete process.env.STYX_ADMIN_ACCOUNTS_JSON;
    } else {
      process.env.STYX_ADMIN_ACCOUNTS_JSON = originalAccounts;
    }
  }
});
