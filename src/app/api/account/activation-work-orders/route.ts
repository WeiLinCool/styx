import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createActivationWorkOrder } from '@/server/auth/activation-work-orders';
import { accountErrorToResponse, AccountDomainError } from '@/server/auth/account-types';
import { resolveSession } from '@/server/auth/session';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';

const fingerprintSchema = z.object({
  userAgent: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  platform: z.string().optional(),
  hardwareConcurrency: z.number().optional(),
  colorDepth: z.number().optional(),
  screen: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      colorDepth: z.number().optional(),
    })
    .optional(),
});

const bodySchema = z.object({
  fingerprint: fingerprintSchema,
});

export async function POST(request: Request) {
  try {
    const session = await resolveSession();
    if (!session.authenticated) {
      throw new AccountDomainError('session_required', '请先登录后再生成激活工单。', 401);
    }

    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'sensitive-user-mutation',
        operation: 'POST /api/account/activation-work-orders',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const workOrder = await createActivationWorkOrder({
          userId: session.user.id,
          fingerprint: body.fingerprint,
        });

        return NextResponse.json({
          ok: true,
          workOrder: {
            id: workOrder.id,
            code: workOrder.code,
            status: workOrder.status,
            expiresAt: workOrder.expiresAt,
            deviceMetadata: workOrder.deviceMetadata,
          },
        });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: '激活工单请求无效。',
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
