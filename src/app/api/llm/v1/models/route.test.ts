import assert from 'node:assert/strict';
import test from 'node:test';

import { EnterpriseOAuthError, type ResolvedEnterpriseBearerToken } from '@/server/enterprise/oauth';
import type { EnterpriseAccessTokenRecord } from '@/server/repositories/enterprise-oauth';
import type { UserRecord } from '@/server/auth/account-types';

import { createEnterpriseModelsRouteGet } from './route';

const now = new Date('2026-06-01T12:00:00.000Z');

function resolvedBearer(): ResolvedEnterpriseBearerToken {
  return {
    token: {
      id: 'token-1',
      userId: 'user-1',
      tokenHash: 'hash',
      clientId: 'openpawz-desktop',
      scope: 'models',
      expiresAt: new Date('2026-06-01T13:00:00.000Z'),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies EnterpriseAccessTokenRecord,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      displayName: 'User One',
      accountState: 'active',
      activatedAt: now,
      suspendedAt: null,
      archivedAt: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    } satisfies UserRecord,
  };
}

test('models route validates bearer before listing models', async () => {
  let listedUserId: string | null = null;
  const GET = createEnterpriseModelsRouteGet({
    async resolveEnterpriseBearerToken() {
      return resolvedBearer();
    },
    async listEnterpriseOpenAiModels(userId) {
      listedUserId = userId;
      return {
        object: 'list',
        data: [{ id: 'gpt-4o-mini', object: 'model', owned_by: 'enterprise' }],
      };
    },
  });

  const response = await GET(
    new Request('http://localhost/api/llm/v1/models', {
      headers: { authorization: 'Bearer token' },
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(listedUserId, 'user-1');
  assert.equal(body.data[0].id, 'gpt-4o-mini');
});

test('models route rejects invalid bearer token before listing models', async () => {
  let listCalled = false;
  const GET = createEnterpriseModelsRouteGet({
    async resolveEnterpriseBearerToken() {
      throw new EnterpriseOAuthError('invalid_token', 'Bearer 令牌无效。', 401);
    },
    async listEnterpriseOpenAiModels() {
      listCalled = true;
      throw new Error('should not list models');
    },
  });

  const response = await GET(new Request('http://localhost/api/llm/v1/models'));

  assert.equal(response.status, 401);
  assert.equal(listCalled, false);
  assert.equal(
    response.headers.get('www-authenticate'),
    'Bearer error="invalid_token", error_description="Bearer 令牌无效。"'
  );
});
