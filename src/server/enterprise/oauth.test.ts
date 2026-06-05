import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { UserRecord } from '@/server/auth/account-types';
import { hashSecret } from '@/server/auth/account-crypto';
import { createInMemoryEnterpriseOAuthRepository } from '@/server/repositories/enterprise-oauth';

import {
  exchangeEnterpriseAuthorizationCode,
  issueEnterpriseAuthorizationCode,
  resolveEnterpriseBearerToken,
  type ExchangeEnterpriseAuthorizationCodeInput,
  validateAuthorizeRequest,
  validateLoopbackRedirectUri,
  verifyPkceS256,
} from './oauth';

const now = new Date('2026-06-01T12:00:00.000Z');

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'user@example.com',
    phone: overrides.phone ?? null,
    displayName: overrides.displayName ?? 'User One',
    accountState: overrides.accountState ?? 'active',
    activatedAt: overrides.activatedAt ?? now,
    suspendedAt: overrides.suspendedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

test('validateLoopbackRedirectUri accepts loopback callback URLs', () => {
  assert.equal(
    validateLoopbackRedirectUri('http://127.0.0.1:49231/callback'),
    'http://127.0.0.1:49231/callback',
  );
  assert.equal(
    validateLoopbackRedirectUri('http://localhost:49231/callback'),
    'http://localhost:49231/callback',
  );
});

test('validateLoopbackRedirectUri rejects unsafe callback URLs', () => {
  assert.throws(() => validateLoopbackRedirectUri('https://127.0.0.1:49231/callback'), {
    name: 'EnterpriseOAuthError',
    code: 'invalid_request',
  });
  assert.throws(() => validateLoopbackRedirectUri('http://example.com:49231/callback'), {
    code: 'invalid_request',
  });
  assert.throws(() => validateLoopbackRedirectUri('http://localhost:49231/other'), {
    code: 'invalid_request',
  });
});

test('verifyPkceS256 accepts a matching verifier and rejects mismatch', () => {
  const verifier = 'correct-horse-battery-staple';
  assert.equal(verifyPkceS256(verifier, pkceChallenge(verifier)), true);
  assert.equal(verifyPkceS256('wrong-verifier', pkceChallenge(verifier)), false);
});

test('validateAuthorizeRequest requires the desktop client, safe redirect, S256 PKCE, and state', () => {
  const valid = validateAuthorizeRequest(
    new URLSearchParams({
      response_type: 'code',
      client_id: 'openpawz-desktop',
      redirect_uri: 'http://127.0.0.1:49231/callback',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
      state: 'state-1',
      scope: 'models:proxy',
    }),
  );

  assert.deepEqual(valid, {
    responseType: 'code',
    clientId: 'openpawz-desktop',
    redirectUri: 'http://127.0.0.1:49231/callback',
    codeChallenge: 'challenge-1',
    codeChallengeMethod: 'S256',
    state: 'state-1',
    scope: 'models:proxy',
  });

  for (const [key, value] of [
    ['response_type', 'token'],
    ['client_id', 'other-client'],
    ['redirect_uri', 'http://example.com:49231/callback'],
    ['code_challenge', ''],
    ['code_challenge_method', 'plain'],
    ['state', ''],
  ]) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'openpawz-desktop',
      redirect_uri: 'http://127.0.0.1:49231/callback',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
      state: 'state-1',
    });
    params.set(key, value);

    assert.throws(() => validateAuthorizeRequest(params), {
      name: 'EnterpriseOAuthError',
    });
  }
});

test('issueEnterpriseAuthorizationCode authenticates an active user and stores a hashed code', async () => {
  const repo = createInMemoryEnterpriseOAuthRepository();
  const user = createUser();
  const deps = {
    repository: repo,
    authenticateExistingUserWithPassword: async (input: {
      login: string;
      password: string;
    }) => {
      assert.deepEqual(input, { login: 'user@example.com', password: 'password-1' });
      return user;
    },
    createToken: () => 'authorization-code-1',
    hashSecret,
    now: () => now,
  };

  const result = await issueEnterpriseAuthorizationCode(
    {
      responseType: 'code',
      clientId: 'openpawz-desktop',
      redirectUri: 'http://127.0.0.1:49231/callback',
      codeChallenge: pkceChallenge('verifier-1'),
      codeChallengeMethod: 'S256',
      state: 'state-1',
      scope: 'models:proxy',
      login: 'user@example.com',
      password: 'password-1',
    },
    deps,
  );

  assert.equal(result.code, 'authorization-code-1');
  assert.equal(
    result.redirectUrl,
    'http://127.0.0.1:49231/callback?code=authorization-code-1&state=state-1',
  );
  assert.equal(result.authorizationCode.codeHash, hashSecret('authorization-code-1'));
  assert.equal(result.authorizationCode.expiresAt.toISOString(), '2026-06-01T12:05:00.000Z');

  await assert.rejects(
    issueEnterpriseAuthorizationCode(
      {
        responseType: 'code',
        clientId: 'openpawz-desktop',
        redirectUri: 'http://127.0.0.1:49231/callback',
        codeChallenge: pkceChallenge('verifier-1'),
        codeChallengeMethod: 'S256',
        state: 'state-1',
        scope: '',
        login: 'user@example.com',
        password: 'password-1',
      },
      {
        ...deps,
        authenticateExistingUserWithPassword: async () =>
          createUser({ accountState: 'pending_activation' }),
      },
    ),
    { code: 'access_denied' },
  );
});

test('exchangeEnterpriseAuthorizationCode rejects replay, binding mismatches, expiry, missing code, and PKCE mismatch', async () => {
  const repo = createInMemoryEnterpriseOAuthRepository();
  await repo.createEnterpriseAuthorizationCode({
    userId: 'user-1',
    codeHash: hashSecret('code-1'),
    clientId: 'openpawz-desktop',
    redirectUri: 'http://127.0.0.1:49231/callback',
    codeChallenge: pkceChallenge('verifier-1'),
    codeChallengeMethod: 'S256',
    scope: 'models:proxy',
    state: 'state-1',
    expiresAt: new Date('2026-06-01T12:05:00.000Z'),
    now,
  });
  await repo.createEnterpriseAuthorizationCode({
    userId: 'user-1',
    codeHash: hashSecret('expired-code'),
    clientId: 'openpawz-desktop',
    redirectUri: 'http://127.0.0.1:49231/callback',
    codeChallenge: pkceChallenge('verifier-expired'),
    codeChallengeMethod: 'S256',
    scope: '',
    state: 'state-expired',
    expiresAt: new Date('2026-06-01T11:59:00.000Z'),
    now: new Date('2026-06-01T11:54:00.000Z'),
  });

  const deps = {
    repository: repo,
    getUserById: async () => createUser(),
    createToken: () => 'access-token-1',
    hashSecret,
    now: () => now,
  };

  const success = await exchangeEnterpriseAuthorizationCode(
    {
      grantType: 'authorization_code',
      code: 'code-1',
      redirectUri: 'http://127.0.0.1:49231/callback',
      clientId: 'openpawz-desktop',
      codeVerifier: 'verifier-1',
    },
    deps,
  );
  assert.equal(success.access_token, 'access-token-1');
  assert.equal(success.token_type, 'Bearer');
  assert.equal(success.expires_in, 3600);
  assert.equal(success.scope, 'models:proxy');

  await assert.rejects(
    exchangeEnterpriseAuthorizationCode(
      {
        grantType: 'authorization_code',
        code: 'code-1',
        redirectUri: 'http://127.0.0.1:49231/callback',
        clientId: 'openpawz-desktop',
        codeVerifier: 'verifier-1',
      },
      deps,
    ),
    { code: 'invalid_grant' },
  );

  const invalidGrantInputs: ExchangeEnterpriseAuthorizationCodeInput[] = [
    {
      grantType: 'authorization_code',
      code: 'missing-code',
      redirectUri: 'http://127.0.0.1:49231/callback',
      clientId: 'openpawz-desktop',
      codeVerifier: 'verifier-1',
    },
    {
      grantType: 'authorization_code',
      code: 'expired-code',
      redirectUri: 'http://127.0.0.1:49231/callback',
      clientId: 'openpawz-desktop',
      codeVerifier: 'verifier-expired',
    },
  ];
  for (const input of invalidGrantInputs) {
    await assert.rejects(exchangeEnterpriseAuthorizationCode(input, deps), {
      code: 'invalid_grant',
    });
  }

  for (const scenario of [
    {
      code: 'redirect-code',
      input: {
        redirectUri: 'http://localhost:49231/callback',
        clientId: 'openpawz-desktop',
        codeVerifier: 'redirect-code-verifier',
      },
    },
    {
      code: 'client-code',
      input: {
        redirectUri: 'http://127.0.0.1:49231/callback',
        clientId: 'other-client',
        codeVerifier: 'client-code-verifier',
      },
    },
    {
      code: 'pkce-code',
      input: {
        redirectUri: 'http://127.0.0.1:49231/callback',
        clientId: 'openpawz-desktop',
        codeVerifier: 'wrong-verifier',
      },
    },
  ] as const) {
    await repo.createEnterpriseAuthorizationCode({
      userId: 'user-1',
      codeHash: hashSecret(scenario.code),
      clientId: 'openpawz-desktop',
      redirectUri: 'http://127.0.0.1:49231/callback',
      codeChallenge: pkceChallenge(`${scenario.code}-verifier`),
      codeChallengeMethod: 'S256',
      scope: '',
      state: `${scenario.code}-state`,
      expiresAt: new Date('2026-06-01T12:05:00.000Z'),
      now,
    });

    await assert.rejects(
      exchangeEnterpriseAuthorizationCode(
        {
          grantType: 'authorization_code',
          code: scenario.code,
          ...scenario.input,
        } as ExchangeEnterpriseAuthorizationCodeInput,
        deps,
      ),
      { code: 'invalid_grant' },
    );
  }
});

test('resolveEnterpriseBearerToken rejects malformed, unknown, expired, and inactive-user tokens', async () => {
  const repo = createInMemoryEnterpriseOAuthRepository();
  await repo.createEnterpriseAccessToken({
    userId: 'user-1',
    tokenHash: hashSecret('active-token'),
    clientId: 'openpawz-desktop',
    scope: 'models:proxy',
    expiresAt: new Date('2026-06-01T13:00:00.000Z'),
    now,
  });
  await repo.createEnterpriseAccessToken({
    userId: 'user-1',
    tokenHash: hashSecret('expired-token'),
    clientId: 'openpawz-desktop',
    scope: '',
    expiresAt: new Date('2026-06-01T11:59:00.000Z'),
    now: new Date('2026-06-01T11:00:00.000Z'),
  });
  await repo.createEnterpriseAccessToken({
    userId: 'inactive-user',
    tokenHash: hashSecret('inactive-token'),
    clientId: 'openpawz-desktop',
    scope: '',
    expiresAt: new Date('2026-06-01T13:00:00.000Z'),
    now,
  });

  const deps = {
    repository: repo,
    getUserById: async (id: string) =>
      id === 'inactive-user'
        ? createUser({ id, accountState: 'suspended' })
        : createUser({ id }),
    hashSecret,
    now: () => now,
  };

  for (const header of [null, '', 'Basic active-token', 'Bearer', 'Bearer active token']) {
    await assert.rejects(resolveEnterpriseBearerToken(header, deps), {
      code: 'invalid_request',
    });
  }

  await assert.rejects(resolveEnterpriseBearerToken('Bearer unknown-token', deps), {
    code: 'invalid_grant',
  });
  await assert.rejects(resolveEnterpriseBearerToken('Bearer expired-token', deps), {
    code: 'invalid_grant',
  });
  await assert.rejects(resolveEnterpriseBearerToken('Bearer inactive-token', deps), {
    code: 'access_denied',
  });

  const resolved = await resolveEnterpriseBearerToken('Bearer active-token', deps);
  assert.equal(resolved.token.tokenHash, hashSecret('active-token'));
  assert.equal(resolved.user.id, 'user-1');
});
