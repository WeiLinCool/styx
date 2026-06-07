import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  accountErrorToResponse,
  AccountDomainError,
} from '@/server/auth/account-types';
import { findExistingUserByLogin } from '@/server/auth/account-service';
import { hashUserPassword } from '@/server/auth/public-auth';
import { updateUserMetadata } from '@/server/repositories/users';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';

const bodySchema = z.object({
  login: z.string().min(1).max(128).optional(),
  phone: z.string().min(6).max(32).optional(),
  password: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
  mode: z.enum(['initial', 'reset']).optional(),
}).refine(
  (body) => Boolean(body.login?.trim() || body.phone?.trim()),
  {
    message: '账号不能为空。',
    path: ['login'],
  },
);

export async function POST(request: Request) {
  try {
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);
    const login = (body.login ?? body.phone ?? '').trim();
    if (body.password !== body.confirmPassword) {
      throw new AccountDomainError('session_required', '两次输入的密码不一致。', 400);
    }

    const user = await findExistingUserByLogin(login);
    if (!user) {
      throw new AccountDomainError('account_not_found', '当前账号未注册。', 404);
    }

    const mode = body.mode ?? 'initial';
    const mustResetPassword = user.metadata?.mustResetPassword === true;

    if (mode === 'initial' && 'passwordHash' in (user.metadata ?? {})) {
      throw new AccountDomainError('session_required', '当前账号已设置密码，请直接登录。', 409);
    }

    if (mode === 'reset' && !mustResetPassword) {
      throw new AccountDomainError('session_required', '当前账号不需要执行密码重置。', 409);
    }

    return runProtectedMutation(
      {
        request,
        routeKind: 'sensitive-user-mutation',
        operation: 'POST /api/auth/set-password',
        actorType: 'anonymous',
        actorId: login,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        await updateUserMetadata(user.id, {
          ...(user.metadata ?? {}),
          passwordHash: hashUserPassword(body.password),
          mustResetPassword: false,
        });

        return createJsonResponse({ ok: true });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: '设置密码请求无效。',
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
