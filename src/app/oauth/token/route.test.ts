import assert from 'node:assert/strict';
import test from 'node:test';

import { EnterpriseOAuthError, type EnterpriseTokenRequest } from '@/server/enterprise/oauth';
import {
  parseBearerAuthorizationHeader,
  createOAuthErrorJsonResponse,
  createProtectedEnterpriseJsonGet,
} from '@/server/enterprise/oauth-route-responses';
import { createTokenRoutePost, parseOAuthTokenRequestBody } from './route';

test('createOAuthErrorJsonResponse returns standard OAuth error JSON and status', async () => {
  const response = createOAuthErrorJsonResponse(
    new EnterpriseOAuthError('invalid_grant', '授权码无效。', 418),
  );
  const body = await response.json();

  assert.equal(response.status, 418);
  assert.deepEqual(body, {
    error: 'invalid_grant',
    error_description: '授权码无效。',
  });
});

test('POST parses application/x-www-form-urlencoded token body and returns token response JSON', async () => {
  const validatedParams: URLSearchParams[] = [];
  const exchangedRequests: EnterpriseTokenRequest[] = [];

  const POST = createTokenRoutePost({
    validateTokenRequest(params) {
      assert.ok(params instanceof URLSearchParams);
      validatedParams.push(params);
      return {
        grantType: 'authorization_code',
        code: params.get('code') ?? '',
        redirectUri: params.get('redirect_uri') ?? '',
        clientId: 'openpawz-desktop',
        codeVerifier: params.get('code_verifier') ?? '',
      };
    },
    async exchangeEnterpriseAuthorizationCode(input) {
      exchangedRequests.push(input);
      return {
        access_token: 'access-token-1',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile',
      };
    },
  });

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: 'code-1',
    redirect_uri: 'http://127.0.0.1:49152/callback',
    client_id: 'openpawz-desktop',
    code_verifier: 'verifier-1',
  });
  const response = await POST(
    new Request('http://localhost/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(validatedParams[0]?.get('grant_type'), 'authorization_code');
  assert.equal(exchangedRequests[0]?.code, 'code-1');
  assert.deepEqual(payload, {
    access_token: 'access-token-1',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid profile',
  });
});

test('parseOAuthTokenRequestBody returns URLSearchParams for URL-encoded requests', async () => {
  const params = await parseOAuthTokenRequestBody(
    new Request('http://localhost/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: 'grant_type=authorization_code&code=code-1',
    }),
  );

  assert.ok(params instanceof URLSearchParams);
  assert.equal(params.get('code'), 'code-1');
});

test('parseOAuthTokenRequestBody rejects unsupported content types with OAuth invalid_request', async () => {
  await assert.rejects(
    () =>
      parseOAuthTokenRequestBody(
        new Request('http://localhost/oauth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ grant_type: 'authorization_code' }),
        }),
      ),
    {
      name: 'EnterpriseOAuthError',
      code: 'invalid_request',
    },
  );
});

test('createProtectedEnterpriseJsonGet rejects invalid bearer token errors', async () => {
  const GET = createProtectedEnterpriseJsonGet({
    async resolveEnterpriseBearerToken() {
      throw new EnterpriseOAuthError('invalid_token', 'Bearer 令牌无效。', 401);
    },
    async handleResolvedBearer() {
      assert.fail('handler should not run when bearer resolution fails');
    },
  });

  const response = await GET(
    new Request('http://localhost/oauth/userinfo', {
      headers: { authorization: 'Bearer bad-token' },
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get('www-authenticate'),
    'Bearer error="invalid_token", error_description="Bearer 令牌无效。"'
  );
  assert.deepEqual(body, {
    error: 'invalid_token',
    error_description: 'Bearer 令牌无效。',
  });
});

test('parseBearerAuthorizationHeader creates bearer challenge for invalid token errors', () => {
  assert.equal(
    parseBearerAuthorizationHeader(
      new EnterpriseOAuthError('invalid_token', 'Bearer 令牌无效。', 401),
    ),
    'Bearer error="invalid_token", error_description="Bearer 令牌无效。"'
  );
});
