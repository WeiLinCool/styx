import { NextResponse } from 'next/server';
import { z } from 'zod';

import { registerOrLoginUser } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';

const bodySchema = z.object({
  phone: z.string().min(6).max(32),
  nickname: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await registerOrLoginUser({
      phone: body.phone,
      displayName: body.nickname,
      email: body.email,
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: result.user.id,
        displayName: result.user.displayName,
        phone: result.user.phone,
        email: result.user.email,
        accountState: result.user.accountState,
      },
    });

    response.cookies.set('nfai_auth_token', result.token, {
      expires: result.expiresAt,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: '登录请求无效。',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
