import { createHash, timingSafeEqual } from 'node:crypto';

import { authenticateExistingUserWithPassword } from '@/server/auth/account-service';
import { createOpaqueToken, hashSecret as defaultHashSecret } from '@/server/auth/account-crypto';
import type { UserRecord } from '@/server/auth/account-types';
import {
  createEnterpriseAccessToken,
  createEnterpriseAuthorizationCode,
  consumeEnterpriseAuthorizationCode,
  getEnterpriseAccessTokenByHash,
  type EnterpriseAccessTokenRecord,
  type EnterpriseOAuthRepository,
} from '@/server/repositories/enterprise-oauth';
import { getUserById } from '@/server/repositories/users';

export type EnterpriseOAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
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
  consumeEnterpriseAuthorizationCode,
  createEnterpriseAccessToken,
  getEnterpriseAccessTokenByHash,
};

export function validateLoopbackRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri is invalid.');
  }

  if (url.protocol !== 'http:') {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri must use http.');
  }

  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri must be loopback.');
  }

  if (url.pathname !== '/callback') {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri path must be /callback.');
  }

  if (!url.port) {
    throw new EnterpriseOAuthError('invalid_request', 'redirect_uri must include a port.');
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
    throw new EnterpriseOAuthError('invalid_request', 'response_type must be code.');
  }

  if (clientId !== ENTERPRISE_DESKTOP_CLIENT_ID) {
    throw new EnterpriseOAuthError('unauthorized_client', 'client_id is not allowed.', 401);
  }

  if (codeChallengeMethod !== 'S256') {
    throw new EnterpriseOAuthError(
      'invalid_request',
      'code_challenge_method must be S256.',
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
    throw new EnterpriseOAuthError('invalid_request', 'grant_type must be authorization_code.');
  }

  if (clientId !== ENTERPRISE_DESKTOP_CLIENT_ID) {
    throw new EnterpriseOAuthError('invalid_client', 'client_id is invalid.', 401);
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

  const consumed = await resolvedDeps.repository.consumeEnterpriseAuthorizationCode(
    resolvedDeps.hashSecret(input.code),
    resolvedDeps.now(),
  );
  if (!consumed) {
    throw new EnterpriseOAuthError('invalid_grant', 'Authorization code is invalid.', 400);
  }

  if (
    consumed.clientId !== input.clientId ||
    consumed.redirectUri !== input.redirectUri ||
    consumed.codeChallengeMethod !== 'S256' ||
    !verifyPkceS256(input.codeVerifier, consumed.codeChallenge)
  ) {
    throw new EnterpriseOAuthError('invalid_grant', 'Authorization code binding is invalid.');
  }

  const user = await resolvedDeps.getUserById(consumed.userId);
  if (!user) {
    throw new EnterpriseOAuthError('invalid_grant', 'Authorization code user is missing.');
  }
  assertActiveUser(user);

  const issuedAt = resolvedDeps.now();
  const accessToken = resolvedDeps.createToken();
  await resolvedDeps.repository.createEnterpriseAccessToken({
    userId: consumed.userId,
    tokenHash: resolvedDeps.hashSecret(accessToken),
    clientId: input.clientId,
    scope: consumed.scope,
    expiresAt: new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_MS),
    now: issuedAt,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: consumed.scope,
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
    throw new EnterpriseOAuthError('invalid_grant', 'Bearer token is invalid.', 401);
  }

  const user = await resolvedDeps.getUserById(token.userId);
  if (!user) {
    throw new EnterpriseOAuthError('invalid_grant', 'Bearer token user is missing.', 401);
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
  throw new EnterpriseOAuthError('invalid_request', 'Token request body is invalid.');
}

function hasGet(value: unknown): value is { get(name: string): unknown } {
  return Boolean(value && typeof value === 'object' && 'get' in value);
}

function requireParam(params: Pick<URLSearchParams, 'get'>, name: string): string {
  const value = params.get(name)?.trim();
  if (!value) {
    throw new EnterpriseOAuthError('invalid_request', `${name} is required.`);
  }
  return value;
}

function assertDesktopClient(clientId: string): asserts clientId is typeof ENTERPRISE_DESKTOP_CLIENT_ID {
  if (clientId !== ENTERPRISE_DESKTOP_CLIENT_ID) {
    throw new EnterpriseOAuthError('unauthorized_client', 'client_id is not allowed.', 401);
  }
}

function assertTokenRequest(input: EnterpriseTokenRequest) {
  if (input.grantType !== 'authorization_code') {
    throw new EnterpriseOAuthError('invalid_request', 'grant_type must be authorization_code.');
  }
  if (!input.clientId) {
    throw new EnterpriseOAuthError('invalid_request', 'client_id is required.');
  }
  validateLoopbackRedirectUri(input.redirectUri);
  if (!input.code || !input.codeVerifier) {
    throw new EnterpriseOAuthError('invalid_request', 'code and code_verifier are required.');
  }
}

function assertActiveUser(user: UserRecord) {
  if (user.accountState !== 'active') {
    throw new EnterpriseOAuthError('access_denied', 'User account is not active.', 403);
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
    throw new EnterpriseOAuthError('invalid_request', 'Authorization bearer token is required.', 401);
  }

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    throw new EnterpriseOAuthError('invalid_request', 'Authorization bearer token is malformed.', 401);
  }

  return parts[1];
}
