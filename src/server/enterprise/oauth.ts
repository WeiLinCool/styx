import { createHash, timingSafeEqual } from 'node:crypto';

import { authenticateExistingUserWithPassword } from '@/server/auth/account-service';
import { createOpaqueToken, hashSecret as defaultHashSecret } from '@/server/auth/account-crypto';
import type { UserRecord } from '@/server/auth/account-types';
import {
  createEnterpriseAccessToken,
  createEnterpriseAuthorizationCode,
  consumeEnterpriseAuthorizationCode,
  getEnterpriseAuthorizationCodeByHash,
  getEnterpriseAccessTokenByHash,
  type EnterpriseAccessTokenRecord,
  type EnterpriseOAuthRepository,
} from '@/server/repositories/enterprise-oauth';
import { getUserById } from '@/server/repositories/users';

export type EnterpriseOAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_token'
  | 'unauthorized_client'
  | 'access_denied';

export class EnterpriseOAuthError extends Error {
  constructor(
    public readonly code: EnterpriseOAuthErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'EnterpriseOAuthError';
  }
}

export type EnterpriseAuthorizeRequest = {
  responseType: 'code';
  clientId: typeof ENTERPRISE_DESKTOP_CLIENT_ID;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  state: string;
  scope: string;
};

export type EnterpriseTokenRequest = {
  grantType: 'authorization_code';
  code: string;
  redirectUri: string;
  clientId: typeof ENTERPRISE_DESKTOP_CLIENT_ID;
  codeVerifier: string;
};

export type EnterpriseTokenResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
};

export type EnterpriseOAuthServiceDeps = {
  repository?: EnterpriseOAuthRepository;
  authenticateExistingUserWithPassword?: (input: {
    login: string;
    password: string;
  }) => Promise<UserRecord>;
  getUserById?: (userId: string) => Promise<UserRecord | null>;
  createToken?: () => string;
  hashSecret?: (secret: string) => string;
  now?: () => Date;
};

export type IssueEnterpriseAuthorizationCodeInput = EnterpriseAuthorizeRequest & {
  login: string;
  password: string;
};

export type ExchangeEnterpriseAuthorizationCodeInput = EnterpriseTokenRequest;

export type ResolvedEnterpriseBearerToken = {
  token: EnterpriseAccessTokenRecord;
  user: UserRecord;
};

const ENTERPRISE_DESKTOP_CLIENT_ID = 'openpawz-desktop';
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;

const defaultRepository: EnterpriseOAuthRepository = {
  createEnterpriseAuthorizationCode,
  getEnterpriseAuthorizationCodeByHash,
  consumeEnterpriseAuthorizationCode,
  createEnterpriseAccessToken,
  getEnterpriseAccessTokenByHash,
};

export function validateLoopbackRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri 无效。');
  }

  if (url.protocol !== 'http:') {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri 必须使用 http。');
  }

  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri 必须是环回地址。');
  }

  if (url.pathname !== '/callback') {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri 路径必须是 /callback。');
  }

  if (!url.port) {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri 必须包含端口。');
  }

  url.hash = '';
  return url.toString();
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) {
    return false;
  }

  const computed = createHash('sha256').update(verifier).digest('base64url');
  const computedBuffer = Buffer.from(computed);
  const challengeBuffer = Buffer.from(challenge);
  if (computedBuffer.length !== challengeBuffer.length) {
    return false;
  }
  return timingSafeEqual(computedBuffer, challengeBuffer);
}

export function validateAuthorizeRequest(
  urlOrSearchParams: URL | URLSearchParams | string,
): EnterpriseAuthorizeRequest {
  const params = toSearchParams(urlOrSearchParams);
  const responseType = requireParam(params, 'response_type');
  const clientId = requireParam(params, 'client_id');
  const redirectUri = validateLoopbackRedirectUri(requireParam(params, 'redirect_uri'));
  const codeChallenge = requireParam(params, 'code_challenge');
  const codeChallengeMethod = requireParam(params, 'code_challenge_method');
  const state = requireParam(params, 'state');

  if (responseType !== 'code') {
    throw new EnterpriseOAuthError('invalid_request', 'response_type 必须为 code。');
  }

  if (clientId !== ENTERPRISE_DESKTOP_CLIENT_ID) {
    throw new EnterpriseOAuthError('unauthorized_client', 'client_id 不被允许。', 401);
  }

  if (codeChallengeMethod !== 'S256') {
    throw new EnterpriseOAuthError(
      'invalid_request',
      'code_challenge_method 必须为 S256。',
    );
  }

  return {
    responseType,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    state,
    scope: params.get('scope')?.trim() ?? '',
  };
}

export function validateTokenRequest(formDataLike: unknown): EnterpriseTokenRequest {
  const params = toFormParams(formDataLike);
  const grantType = requireParam(params, 'grant_type');
  const code = requireParam(params, 'code');
  const redirectUri = validateLoopbackRedirectUri(requireParam(params, 'redirect_uri'));
  const clientId = requireParam(params, 'client_id');
  const codeVerifier = requireParam(params, 'code_verifier');

  if (grantType !== 'authorization_code') {
    throw new EnterpriseOAuthError('invalid_request', 'grant_type 必须为 authorization_code。');
  }

  if (clientId !== ENTERPRISE_DESKTOP_CLIENT_ID) {
    throw new EnterpriseOAuthError('invalid_client', 'client_id 无效。', 401);
  }

  return {
    grantType,
    code,
    redirectUri,
    clientId,
    codeVerifier,
  };
}

export function buildOAuthErrorRedirect(
  redirectUri: string,
  error: Pick<EnterpriseOAuthError, 'code' | 'message'>,
  state?: string,
) {
  const url = new URL(validateLoopbackRedirectUri(redirectUri));
  url.searchParams.set('error', error.code);
  url.searchParams.set('error_description', error.message);
  if (state) {
    url.searchParams.set('state', state);
  }
  return url.toString();
}

export async function issueEnterpriseAuthorizationCode(
  input: IssueEnterpriseAuthorizationCodeInput,
  deps: EnterpriseOAuthServiceDeps = {},
) {
  const resolvedDeps = resolveDeps(deps);
  assertDesktopClient(input.clientId);

  const redirectUri = validateLoopbackRedirectUri(input.redirectUri);
  const user = await resolvedDeps.authenticateExistingUserWithPassword({
    login: input.login,
    password: input.password,
  });
  assertActiveUser(user);

  const issuedAt = resolvedDeps.now();
  const code = resolvedDeps.createToken();
  const expiresAt = new Date(issuedAt.getTime() + AUTHORIZATION_CODE_TTL_MS);
  const record = await resolvedDeps.repository.createEnterpriseAuthorizationCode({
    userId: user.id,
    codeHash: resolvedDeps.hashSecret(code),
    clientId: ENTERPRISE_DESKTOP_CLIENT_ID,
    redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    scope: input.scope,
    state: input.state,
    expiresAt,
    now: issuedAt,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', input.state);

  return {
    code,
    redirectUrl: redirectUrl.toString(),
    authorizationCode: record,
    user,
  };
}

export async function exchangeEnterpriseAuthorizationCode(
  input: ExchangeEnterpriseAuthorizationCodeInput,
  deps: EnterpriseOAuthServiceDeps = {},
): Promise<EnterpriseTokenResponse> {
  const resolvedDeps = resolveDeps(deps);
  assertTokenRequest(input);
  const redirectUri = validateLoopbackRedirectUri(input.redirectUri);
  const codeHash = resolvedDeps.hashSecret(input.code);

  const authorizationCode = await resolvedDeps.repository.getEnterpriseAuthorizationCodeByHash(
    codeHash,
    resolvedDeps.now(),
  );
  if (!authorizationCode) {
    throw new EnterpriseOAuthError('invalid_grant', '授权码无效。', 400);
  }

  if (
    authorizationCode.clientId !== input.clientId ||
    authorizationCode.redirectUri !== redirectUri ||
    authorizationCode.codeChallengeMethod !== 'S256' ||
    !verifyPkceS256(input.codeVerifier, authorizationCode.codeChallenge)
  ) {
    throw new EnterpriseOAuthError('invalid_grant', '授权码绑定无效。');
  }

  const consumed = await resolvedDeps.repository.consumeEnterpriseAuthorizationCode(
    codeHash,
    resolvedDeps.now(),
  );
  if (!consumed) {
    throw new EnterpriseOAuthError('invalid_grant', '授权码无效。', 400);
  }

  const user = await resolvedDeps.getUserById(authorizationCode.userId);
  if (!user) {
    throw new EnterpriseOAuthError('invalid_grant', '授权码对应的用户不存在。');
  }
  assertActiveUser(user);

  const issuedAt = resolvedDeps.now();
  const accessToken = resolvedDeps.createToken();
  await resolvedDeps.repository.createEnterpriseAccessToken({
    userId: authorizationCode.userId,
    tokenHash: resolvedDeps.hashSecret(accessToken),
    clientId: input.clientId,
    scope: authorizationCode.scope,
    expiresAt: new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_MS),
    now: issuedAt,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: authorizationCode.scope,
  };
}

export async function resolveEnterpriseBearerToken(
  requestOrHeader: Request | Headers | string | null | undefined,
  deps: EnterpriseOAuthServiceDeps = {},
): Promise<ResolvedEnterpriseBearerToken> {
  const resolvedDeps = resolveDeps(deps);
  const bearerToken = parseBearerToken(requestOrHeader);
  const token = await resolvedDeps.repository.getEnterpriseAccessTokenByHash(
    resolvedDeps.hashSecret(bearerToken),
    resolvedDeps.now(),
  );

  if (!token) {
    throw new EnterpriseOAuthError('invalid_token', 'Bearer 令牌无效。', 401);
  }

  const user = await resolvedDeps.getUserById(token.userId);
  if (!user) {
    throw new EnterpriseOAuthError('invalid_token', 'Bearer 令牌对应的用户不存在。', 401);
  }
  assertActiveUser(user);

  return { token, user };
}

function resolveDeps(deps: EnterpriseOAuthServiceDeps) {
  return {
    repository: deps.repository ?? defaultRepository,
    authenticateExistingUserWithPassword:
      deps.authenticateExistingUserWithPassword ?? authenticateExistingUserWithPassword,
    getUserById: deps.getUserById ?? getUserById,
    createToken: deps.createToken ?? createOpaqueToken,
    hashSecret: deps.hashSecret ?? defaultHashSecret,
    now: deps.now ?? (() => new Date()),
  };
}

function toSearchParams(value: URL | URLSearchParams | string) {
  if (value instanceof URLSearchParams) {
    return value;
  }
  if (value instanceof URL) {
    return value.searchParams;
  }
  return new URL(value).searchParams;
}

function toFormParams(formDataLike: unknown): URLSearchParams {
  if (formDataLike instanceof URLSearchParams) {
    return formDataLike;
  }
  if (typeof FormData !== 'undefined' && formDataLike instanceof FormData) {
    const params = new URLSearchParams();
    for (const [key, value] of formDataLike.entries()) {
      if (typeof value === 'string') {
        params.set(key, value);
      }
    }
    return params;
  }
  if (hasGet(formDataLike)) {
    return {
      get(name: string) {
        const value = formDataLike.get(name);
        return typeof value === 'string' ? value : null;
      },
    } as URLSearchParams;
  }
  if (formDataLike && typeof formDataLike === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(formDataLike)) {
      if (typeof value === 'string') {
        params.set(key, value);
      }
    }
    return params;
  }
  throw new EnterpriseOAuthError('invalid_request', '令牌请求体无效。');
}

function hasGet(value: unknown): value is { get(name: string): unknown } {
  return Boolean(value && typeof value === 'object' && 'get' in value);
}

function requireParam(params: Pick<URLSearchParams, 'get'>, name: string): string {
  const value = params.get(name)?.trim();
  if (!value) {
    const label = name === 'login' ? '账号' : name === 'password' ? '密码' : name;
    throw new EnterpriseOAuthError('invalid_request', `${label} 是必填项。`);
  }
  return value;
}

function assertDesktopClient(clientId: string): asserts clientId is typeof ENTERPRISE_DESKTOP_CLIENT_ID {
  if (clientId !== ENTERPRISE_DESKTOP_CLIENT_ID) {
    throw new EnterpriseOAuthError('unauthorized_client', 'client_id 不被允许。', 401);
  }
}

function assertTokenRequest(input: EnterpriseTokenRequest) {
  if (input.grantType !== 'authorization_code') {
    throw new EnterpriseOAuthError('invalid_request', 'grant_type 必须为 authorization_code。');
  }
  if (!input.clientId) {
    throw new EnterpriseOAuthError('invalid_request', 'client_id 是必填项。');
  }
  validateLoopbackRedirectUri(input.redirectUri);
  if (!input.code || !input.codeVerifier) {
    throw new EnterpriseOAuthError('invalid_request', 'code 和 code_verifier 是必填项。');
  }
}

function assertActiveUser(user: UserRecord) {
  if (user.accountState !== 'active') {
    throw new EnterpriseOAuthError('access_denied', '用户账号未激活。', 403);
  }
}

function parseBearerToken(requestOrHeader: Request | Headers | string | null | undefined) {
  let header: string | null | undefined;
  if (typeof requestOrHeader === 'string' || !requestOrHeader) {
    header = requestOrHeader;
  } else if ('headers' in requestOrHeader) {
    header = requestOrHeader.headers.get('authorization');
  } else {
    header = requestOrHeader.get('authorization');
  }

  if (!header) {
    throw new EnterpriseOAuthError('invalid_request', '必须提供 Authorization Bearer 令牌。', 401);
  }

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    throw new EnterpriseOAuthError('invalid_request', 'Authorization Bearer 令牌格式无效。', 401);
  }

  return parts[1];
}
