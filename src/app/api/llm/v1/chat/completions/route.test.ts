import assert from 'node:assert/strict';
import test from 'node:test';

import { EnterpriseGatewayError } from '@/server/enterprise/gateway';
import { EnterpriseOAuthError, type ResolvedEnterpriseBearerToken } from '@/server/enterprise/oauth';
import type { EnterpriseAccessTokenRecord } from '@/server/repositories/enterprise-oauth';
import type { UserRecord } from '@/server/auth/account-types';

import { createEnterpriseChatCompletionsRoutePost } from './route';

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
      avatarUrl: null,
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

test('chat completions route rejects invalid JSON as gateway invalid_request', async () => {
  const POST = createEnterpriseChatCompletionsRoutePost({
    async resolveEnterpriseBearerToken() {
      return resolvedBearer();
    },
    async requireEnterpriseModelProxy() {
      return { plan: 'enterprise', entitlements: ['models:proxy'] };
    },
  });

  const response = await POST(
    new Request('http://localhost/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: '{not-json',
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    error: 'invalid_request',
    error_description: 'Request body must be valid JSON.',
  });
});

test('chat completions route checks entitlement before parsing model/provider request', async () => {
  let createCompletionCalled = false;
  const POST = createEnterpriseChatCompletionsRoutePost({
    async resolveEnterpriseBearerToken() {
      return resolvedBearer();
    },
    async requireEnterpriseModelProxy() {
      throw new EnterpriseGatewayError(
        'insufficient_entitlement',
        'Enterprise model proxy entitlement is required.',
        403,
      );
    },
    async createEnterpriseChatCompletion() {
      createCompletionCalled = true;
      throw new Error('should not call provider path');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(createCompletionCalled, false);
});

test('chat completions route returns bearer challenge for invalid token', async () => {
  const POST = createEnterpriseChatCompletionsRoutePost({
    async resolveEnterpriseBearerToken() {
      throw new EnterpriseOAuthError('invalid_token', 'Bearer token is invalid.', 401);
    },
  });

  const response = await POST(
    new Request('http://localhost/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer bad-token' },
      body: '{}',
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get('www-authenticate'),
    'Bearer error="invalid_token", error_description="Bearer token is invalid."',
  );
});
