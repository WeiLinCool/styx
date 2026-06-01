import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectActivationWorkOrder } from '@/server/auth/activation-work-orders';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';

const paramsSchema = z.object({
  workOrderId: z.uuid(),
});

const bodySchema = z.object({
  reason: z.string().min(1).max(240).default('客服审核拒绝'),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
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
        operation: 'POST /api/admin/activation-work-orders/[workOrderId]/reject',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const workOrder = await rejectActivationWorkOrder({
          workOrderId: params.workOrderId,
          actorId: session.user.id,
          reason: body.reason,
        });

        return NextResponse.json({
          ok: true,
          workOrder: {
            id: workOrder.id,
            status: workOrder.status,
            closedAt: workOrder.rejectedAt,
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
            message: '激活工单拒绝请求无效。',
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
