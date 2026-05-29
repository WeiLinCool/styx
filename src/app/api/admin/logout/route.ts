import { NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE } from '@/server/auth/admin-auth-config';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  return response;
}
