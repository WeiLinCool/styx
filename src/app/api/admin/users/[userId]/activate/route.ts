import { NextResponse } from 'next/server';
import { z } from 'zod';

import { activateAccountByAdmin } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const paramsSchema = z.object({
  userId: z.uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const user = await activateAccountByAdmin({
      userId: params.userId,
      actorId: session.user.id,
      reason: body.reason,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        accountState: user.accountState,
        activatedAt: user.activatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Admin activation request is invalid.',
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
