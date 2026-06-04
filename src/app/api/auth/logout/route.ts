import { NextResponse } from 'next/server';

import { DEV_AUTH_BYPASS_COOKIE } from '@/server/auth/session';
import {
  getScopedAuthCookieName,
  getScopedDevAuthBypassCookieName,
  legacyAuthCookieNames,
  resolveCookieScopeHost,
} from '@/lib/auth-cookie-names';

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  const host = resolveCookieScopeHost({
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host'),
    requestUrl: request.url,
  });

  response.cookies.set(getScopedAuthCookieName(host), '', {
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  response.cookies.set(legacyAuthCookieNames.auth, '', {
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  response.cookies.set(getScopedDevAuthBypassCookieName(host), 'true', {
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  response.cookies.set(DEV_AUTH_BYPASS_COOKIE, 'true', {
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
