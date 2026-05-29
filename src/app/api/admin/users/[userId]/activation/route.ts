import { NextResponse } from 'next/server';
import { z } from 'zod';

import { reissueActivation } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';

const bodySchema = z.object({
  purpose: z.enum(['account_activation', 'identity_binding']).optional(),
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
    const activation = await reissueActivation({
      userId: params.userId,
      actorId: session.user.id,
      purpose: body.purpose,
    });

    return NextResponse.json({
      ok: true,
      activation: {
        tokenId: activation.tokenId,
        token: activation.token,
        expiresAt: activation.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Activation reissue request is invalid.',
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
