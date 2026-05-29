import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createAdminSessionFromCredentials,
} from '@/server/auth/admin-auth';
import { ADMIN_SESSION_COOKIE } from '@/server/auth/admin-auth-config';
import { accountErrorToResponse } from '@/server/auth/account-types';

const bodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const session = await createAdminSessionFromCredentials({
      username: body.username,
      password: body.password,
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.json({
      ok: true,
      expiresAt: session.expiresAt,
    });
    response.cookies.set(ADMIN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
