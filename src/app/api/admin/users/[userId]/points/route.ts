import { NextResponse } from 'next/server';
import { z } from 'zod';

import { adjustUserPointsByAdmin } from '@/server/repositories/users';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';

const bodySchema = z.object({
  amount: z
    .number()
    .int()
    .refine((value) => value !== 0, 'Amount must be non-zero.'),
  reason: z.string().trim().min(1).max(500),
});

const paramsSchema = z.object({
  userId: z.uuid(),
});

export async function parseAdminUserPointsParams(
  params: Promise<{ userId: string }>,
) {
  return paramsSchema.parse(await params);
}

export async function parseAdminUserPointsRequest(request: Request) {
  return bodySchema.parse(await request.json().catch(() => ({})));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = await parseAdminUserPointsParams(context.params);
    const body = await parseAdminUserPointsRequest(request);

    const result = await adjustUserPointsByAdmin({
      userId: params.userId,
      actorId: session.user.id,
      amount: body.amount,
      reason: body.reason,
    });

    return NextResponse.json({
      ok: true,
      adjustment: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Admin points adjustment request is invalid.',
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
