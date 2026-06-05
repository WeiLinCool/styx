import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryEnterpriseOAuthRepository } from './enterprise-oauth';

test('in-memory enterprise OAuth repository consumes authorization codes exactly once', async () => {
  const repo = createInMemoryEnterpriseOAuthRepository();
  const now = new Date('2026-06-01T12:00:00.000Z');

  const created = await repo.createEnterpriseAuthorizationCode({
    userId: 'user-1',
    codeHash: 'sha256-code-1',
    clientId: 'enterprise-client',
    redirectUri: 'https://client.example.com/callback',
    codeChallenge: 'challenge-1',
    codeChallengeMethod: 'S256',
    scope: 'plugin:read plugin:write',
    state: 'state-1',
    expiresAt: new Date('2026-06-01T12:05:00.000Z'),
    now,
  });

  const consumed = await repo.consumeEnterpriseAuthorizationCode('sha256-code-1', now);
  const replay = await repo.consumeEnterpriseAuthorizationCode('sha256-code-1', now);

  assert.equal(consumed?.id, created.id);
  assert.equal(consumed?.consumedAt?.toISOString(), now.toISOString());
  assert.equal(replay, null);
});

test('in-memory enterprise OAuth repository resolves only active access tokens', async () => {
  const repo = createInMemoryEnterpriseOAuthRepository();
  const issuedAt = new Date('2026-06-01T12:00:00.000Z');
  const expiresAt = new Date('2026-06-01T13:00:00.000Z');

  const created = await repo.createEnterpriseAccessToken({
    userId: 'user-1',
    tokenHash: 'sha256-token-1',
    clientId: 'enterprise-client',
    scope: 'plugin:read',
    expiresAt,
    now: issuedAt,
  });

  const active = await repo.getEnterpriseAccessTokenByHash(
    'sha256-token-1',
    new Date('2026-06-01T12:30:00.000Z'),
  );
  const expired = await repo.getEnterpriseAccessTokenByHash(
    'sha256-token-1',
    new Date('2026-06-01T13:00:00.000Z'),
  );

  assert.equal(active?.id, created.id);
  assert.equal(active?.tokenHash, 'sha256-token-1');
  assert.equal(expired, null);
});
