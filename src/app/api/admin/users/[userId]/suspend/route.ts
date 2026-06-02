import { NextResponse } from 'next/server';
import { z } from 'zod';

import { suspendAccount } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
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
    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody ?? {});

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/users/[userId]/suspend',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const user = await suspendAccount({
          userId: params.userId,
          actorId: session.user.id,
          reason: body.reason,
        });

        return createJsonResponse({
          ok: true,
          user: {
            id: user.id,
            accountState: user.accountState,
            suspendedAt: user.suspendedAt,
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
            message: 'Admin suspension request is invalid.',
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
