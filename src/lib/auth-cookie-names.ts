const USER_COOKIE_KEY = 'nfai_user';
const AUTH_COOKIE_KEY = 'nfai_auth_token';
const LEGACY_SESSION_COOKIE_KEY = 'styx_session';
const ADMIN_SESSION_COOKIE_KEY = 'styx_admin_session';
const DEV_AUTH_BYPASS_COOKIE_KEY = 'styx_dev_auth_disabled';

function readForwardedHost(forwardedHost: string | null | undefined) {
  const firstValue = forwardedHost?.split(',')[0]?.trim();
  return firstValue || null;
}

function normalizeCookieScopeHost(host: string | null | undefined) {
  const value = host?.trim().toLowerCase() ?? '';
  if (!value) {
    return null;
  }

  return value.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function buildScopedCookieName(baseName: string, host: string | null | undefined) {
  const normalizedHost = normalizeCookieScopeHost(host);
  return normalizedHost ? `${baseName}__${normalizedHost}` : baseName;
}

export function resolveCookieScopeHost(input: {
  forwardedHost?: string | null | undefined;
  host?: string | null | undefined;
  requestUrl?: string | URL | null | undefined;
}) {
  const forwardedHost = readForwardedHost(input.forwardedHost);
  if (forwardedHost) {
    return forwardedHost;
  }

  const host = input.host?.trim();
  if (host) {
    return host;
  }

  if (!input.requestUrl) {
    return null;
  }

  try {
    return new URL(input.requestUrl).host;
  } catch {
    return null;
  }
}

export function getScopedUserCookieName(host: string | null | undefined) {
  return buildScopedCookieName(USER_COOKIE_KEY, host);
}

export function getScopedAuthCookieName(host: string | null | undefined) {
  return buildScopedCookieName(AUTH_COOKIE_KEY, host);
}

export function getScopedLegacySessionCookieName(host: string | null | undefined) {
  return buildScopedCookieName(LEGACY_SESSION_COOKIE_KEY, host);
}

export function getScopedAdminSessionCookieName(host: string | null | undefined) {
  return buildScopedCookieName(ADMIN_SESSION_COOKIE_KEY, host);
}

export function getScopedDevAuthBypassCookieName(host: string | null | undefined) {
  return buildScopedCookieName(DEV_AUTH_BYPASS_COOKIE_KEY, host);
}

export function listSessionCookieNames(host: string | null | undefined) {
  return [
    getScopedLegacySessionCookieName(host),
    getScopedAuthCookieName(host),
    LEGACY_SESSION_COOKIE_KEY,
    AUTH_COOKIE_KEY,
  ];
}

export function listAdminSessionCookieNames(host: string | null | undefined) {
  return [getScopedAdminSessionCookieName(host), ADMIN_SESSION_COOKIE_KEY];
}

export function listDevAuthBypassCookieNames(host: string | null | undefined) {
  return [getScopedDevAuthBypassCookieName(host), DEV_AUTH_BYPASS_COOKIE_KEY];
}

export const legacyAuthCookieNames = {
  user: USER_COOKIE_KEY,
  auth: AUTH_COOKIE_KEY,
  legacySession: LEGACY_SESSION_COOKIE_KEY,
  adminSession: ADMIN_SESSION_COOKIE_KEY,
  devAuthBypass: DEV_AUTH_BYPASS_COOKIE_KEY,
};
