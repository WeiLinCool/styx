import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('nfai_auth_token', '', {
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
