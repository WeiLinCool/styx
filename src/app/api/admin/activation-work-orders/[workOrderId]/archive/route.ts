import { NextResponse } from 'next/server';
import { z } from 'zod';

import { archiveActivationWorkOrder } from '@/server/auth/activation-work-orders';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';

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
    const parsed = await readJsonBody(request);
    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/activation-work-orders/[workOrderId]/archive',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody: parsed.rawBody,
        decryptedRawBody: parsed.decryptedRawBody,
        parsedBody: parsed.body,
      },
      async () => {
        const workOrder = await archiveActivationWorkOrder({
          workOrderId: params.workOrderId,
          actorId: session.user.id,
        });

        return createJsonResponse({
          ok: true,
          workOrder: {
            id: workOrder.id,
            status: workOrder.status,
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
            message: '归档激活工单请求无效。',
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
