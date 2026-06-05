import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { archiveSubscriptionWorkOrder } from '@/server/auth/subscription-work-orders';
import { adminText } from '@/features/admin/admin-i18n';

const paramsSchema = z.object({
  workOrderId: z.uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/subscription-work-orders/[workOrderId]/archive',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const workOrder = await archiveSubscriptionWorkOrder({
          workOrderId: params.workOrderId,
          actorId: session.user.id,
        });

        return NextResponse.json({ ok: true, workOrder });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: adminText.api.subscriptionArchiveInvalid,
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
