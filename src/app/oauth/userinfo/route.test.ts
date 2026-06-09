import assert from 'node:assert/strict';
import test from 'node:test';

import type { UserRecord } from '@/server/auth/account-types';
import { createEnterpriseUserInfoRouteGet } from './route';

const now = new Date('2026-06-01T12:00:00.000Z');

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'alice@example.com',
    phone: overrides.phone ?? null,
    displayName: overrides.displayName ?? 'Alice Example',
    avatarUrl: overrides.avatarUrl ?? null,
    accountState: overrides.accountState ?? 'active',
    activatedAt: overrides.activatedAt ?? now,
    suspendedAt: overrides.suspendedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

test('GET returns enterprise user info with current credit balance', async () => {
  const GET = createEnterpriseUserInfoRouteGet({
    async resolveEnterpriseBearerToken(requestOrHeader) {
      assert.ok(requestOrHeader instanceof Request);
      assert.equal(requestOrHeader.headers.get('authorization'), 'Bearer token-1');
      return {
        token: {
          id: 'token-record-1',
          userId: 'user-1',
          tokenHash: 'hash-1',
          clientId: 'openpawz-desktop',
          scope: 'openid profile',
          expiresAt: new Date('2026-06-01T13:00:00.000Z'),
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        user: createUser(),
      };
    },
    async getCreditBalance(userId) {
      assert.equal(userId, 'user-1');
      return 168;
    },
  });

  const response = await GET(
    new Request('http://localhost/oauth/userinfo', {
      headers: { authorization: 'Bearer token-1' },
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    sub: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Example',
    preferred_username: 'alice@example.com',
    points: 168,
  });
});
