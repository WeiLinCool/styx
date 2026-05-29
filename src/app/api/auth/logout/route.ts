import { NextResponse } from 'next/server';

import { DEV_AUTH_BYPASS_COOKIE } from '@/server/auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('nfai_auth_token', '', {
    expires: new Date(0),
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
