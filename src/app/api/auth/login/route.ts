import { NextResponse } from 'next/server';
import { z } from 'zod';

import { registerOrLoginUser } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { DEV_AUTH_BYPASS_COOKIE } from '@/server/auth/session';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';
import { consumeCheckinVerificationToken } from '@/server/points/checkin-challenge';
import {
  getScopedAuthCookieName,
  getScopedDevAuthBypassCookieName,
  legacyAuthCookieNames,
  resolveCookieScopeHost,
} from '@/lib/auth-cookie-names';

type RegisterOrLoginUserInput = Parameters<typeof registerOrLoginUser>[0];
type RegisterOrLoginUserResult = Awaited<ReturnType<typeof registerOrLoginUser>>;

const bodySchema = z.object({
  phone: z.string().min(6).max(32),
  password: z.string().min(6).max(128),
  nickname: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  inviteCode: z.string().trim().min(1).max(64).optional(),
  verificationToken: z.string().min(1).optional(),
});

export function parseLoginBody(input: unknown) {
  return bodySchema.parse(input);
}

export function createLoginHandler(
  implementation: (input: RegisterOrLoginUserInput) => Promise<RegisterOrLoginUserResult>,
) {
  return async function POST(request: Request) {
    try {
      const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
      const body = parseLoginBody(parsedBody);

      return await runProtectedMutation(
        {
          request,
          routeKind: 'sensitive-user-mutation',
          operation: 'POST /api/auth/login',
          actorType: 'anonymous',
          actorId: body.phone,
          rawBody,
        decryptedRawBody,
          parsedBody,
        },
        async () => {
          if (!body.verificationToken) {
            return NextResponse.json(
              {
                error: {
                  code: 'human_verification_required',
                  message: '请先完成验证码验证。',
                },
              },
              { status: 400 },
            );
          }

          const verified = await consumeCheckinVerificationToken({
            userId: body.phone,
            token: body.verificationToken,
          });
          if (!verified) {
            return NextResponse.json(
              {
                error: {
                  code: 'human_verification_invalid',
                  message: '验证码已失效，请重新验证。',
                },
              },
              { status: 400 },
            );
          }

          const result = await implementation({
            phone: body.phone,
            password: body.password,
            displayName: body.nickname,
            email: body.email,
            inviteCode: body.inviteCode,
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for'),
          });

          const response = await createJsonResponse({
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

          const host = resolveCookieScopeHost({
            forwardedHost: request.headers.get('x-forwarded-host'),
            host: request.headers.get('host'),
            requestUrl: request.url,
          });
          response.cookies.set(getScopedAuthCookieName(host), result.token, {
            expires: result.expiresAt,
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
          response.cookies.set(getScopedDevAuthBypassCookieName(host), '', {
            expires: new Date(0),
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
        },
      );
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
