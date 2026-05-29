import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { recordAuditEvent } from '@/server/audit/audit-service';
import { AccountDomainError, type SessionContext } from './account-types';
import { getUserById, listAdminRoles } from '@/server/repositories/users';

export const ADMIN_SESSION_COOKIE = 'styx_admin_session';
const DEFAULT_ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export type AdminAccountConfig = {
  userId: string;
  username: string;
  passwordHash: string;
  phone: string | null;
  allowWhitelistBypass?: boolean;
};

type SignedAdminPayload = {
  userId: string;
  username: string;
  expiresAt: string;
};

export type AdminSessionPayload = SignedAdminPayload & {
  authMode: 'password_whitelist';
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodeSignedToken(payload: object, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function decodeSignedToken<T extends { expiresAt: string }>(token: string, secret: string): T | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const matches = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!matches) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as T;
  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return payload;
}

export function hashAdminPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

export function verifyAdminPassword(password: string, passwordHash: string) {
  return timingSafeEqual(Buffer.from(hashAdminPassword(password)), Buffer.from(passwordHash));
}

export function parseAdminAccountsConfig(rawConfig: string | undefined) {
  if (!rawConfig) {
    return [] as AdminAccountConfig[];
  }

  const parsed = JSON.parse(rawConfig) as AdminAccountConfig[];
  return parsed.map((account) => ({
    ...account,
    username: account.username.trim(),
    phone: account.phone?.trim() ?? null,
  }));
}

export function getAdminWhitelistConfig(accounts: AdminAccountConfig[]) {
  const accountIds = accounts
    .filter((account) => account.allowWhitelistBypass)
    .map((account) => account.userId);

  return {
    enabled: accountIds.length > 0,
    accountIds,
  };
}

export function getAdminAuthSecret() {
  return process.env.STYX_ADMIN_AUTH_SECRET ?? null;
}

export function getConfiguredAdminAccounts() {
  return parseAdminAccountsConfig(process.env.STYX_ADMIN_ACCOUNTS_JSON);
}

export function createAdminSessionToken(payload: AdminSessionPayload, secret: string) {
  return encodeSignedToken(payload, secret);
}

export function readAdminSessionToken(token: string, secret: string) {
  return decodeSignedToken<AdminSessionPayload>(token, secret);
}

function requireAdminAuthSecret() {
  const secret = getAdminAuthSecret();
  if (!secret) {
    throw new AccountDomainError('admin_required', 'Admin auth is not configured.', 503);
  }

  return secret;
}

function assertWhitelistEligibleAccount(account: AdminAccountConfig) {
  if (!account.allowWhitelistBypass) {
    throw new AccountDomainError('admin_required', '当前账号未被加入管理端准入白名单。', 403);
  }
}

export async function createAdminSessionFromCredentials(input: {
  username: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const secret = requireAdminAuthSecret();
  const accounts = getConfiguredAdminAccounts();
  const account = accounts.find((item) => item.username === input.username.trim());
  if (!account || !verifyAdminPassword(input.password, account.passwordHash)) {
    throw new AccountDomainError('session_required', '账号或密码错误。', 401);
  }

  const user = await getUserById(account.userId);
  if (!user || user.accountState !== 'active') {
    throw new AccountDomainError('admin_required', '后台账号不可用。', 403);
  }

  const roles = await listAdminRoles(user.id);
  if (!roles.some((role) => ['owner', 'admin', 'operator'].includes(role.role))) {
    throw new AccountDomainError('admin_required', '当前账号没有后台权限。', 403);
  }

  assertWhitelistEligibleAccount(account);

  const expiresAt = new Date(Date.now() + DEFAULT_ADMIN_SESSION_TTL_MS).toISOString();
  const token = createAdminSessionToken(
    {
      userId: user.id,
      username: account.username,
      authMode: 'password_whitelist',
      expiresAt,
    },
    secret,
  );
  await recordAuditEvent({
    actorId: user.id,
    targetId: user.id,
    type: 'admin.session_created',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: {
      username: account.username,
      authMode: 'password_whitelist',
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
}

export async function resolveAdminSession(): Promise<SessionContext> {
  const secret = getAdminAuthSecret();
  if (!secret) {
    return {
      authenticated: false,
      user: null,
      sessionId: null,
      source: 'none',
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return {
      authenticated: false,
      user: null,
      sessionId: null,
      source: 'none',
    };
  }

  const payload = readAdminSessionToken(token, secret);
  if (!payload) {
    return {
      authenticated: false,
      user: null,
      sessionId: null,
      source: 'none',
    };
  }

  const user = await getUserById(payload.userId);
  if (!user || user.accountState !== 'active') {
    return {
      authenticated: false,
      user: null,
      sessionId: null,
      source: 'none',
    };
  }

  const roles = await listAdminRoles(user.id);
  return {
    authenticated: true,
    user: {
      ...user,
      adminRoles: roles.map((role) => role.role),
    },
    sessionId: payload.userId,
    source: 'cookie',
  };
}
