import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createAdminSessionFromCredentials,
} from '@/server/auth/admin-auth';
import { ADMIN_SESSION_COOKIE } from '@/server/auth/admin-auth-config';
import { AccountDomainError, accountErrorToResponse } from '@/server/auth/account-types';
import { readJsonBody } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';

const bodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const { body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);
    const session = await createAdminSessionFromCredentials({
      username: body.username,
      password: body.password,
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.headers.get('x-forwarded-for'),
    });

    const response = await createJsonResponse({
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: '管理端登录请求无效。',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    if (!(error instanceof AccountDomainError)) {
      console.error('[admin-login] unexpected error', error);
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
