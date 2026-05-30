import { NextResponse } from 'next/server';
import { z } from 'zod';

import { registerOrLoginUser } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { DEV_AUTH_BYPASS_COOKIE } from '@/server/auth/session';

type RegisterOrLoginUserInput = Parameters<typeof registerOrLoginUser>[0];
type RegisterOrLoginUserResult = Awaited<ReturnType<typeof registerOrLoginUser>>;

const bodySchema = z.object({
  phone: z.string().min(6).max(32),
  password: z.string().min(6).max(128),
  nickname: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  inviteCode: z.string().trim().min(1).max(64).optional(),
});

export function parseLoginBody(input: unknown) {
  return bodySchema.parse(input);
}

export function createLoginHandler(
  implementation: (input: RegisterOrLoginUserInput) => Promise<RegisterOrLoginUserResult>,
) {
  return async function POST(request: Request) {
    try {
      const body = parseLoginBody(await request.json());
      const result = await implementation({
        phone: body.phone,
        password: body.password,
        displayName: body.nickname,
        email: body.email,
        inviteCode: body.inviteCode,
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
          mustResetPassword: result.user.metadata?.mustResetPassword === true,
        },
      });

      response.cookies.set('nfai_auth_token', result.token, {
        expires: result.expiresAt,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      response.cookies.set(DEV_AUTH_BYPASS_COOKIE, '', {
        expires: new Date(0),
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
  };
}

export const POST = createLoginHandler(registerOrLoginUser);
