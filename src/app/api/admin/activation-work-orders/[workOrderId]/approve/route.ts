import { NextResponse } from 'next/server';
import { z } from 'zod';

import { approveActivationWorkOrder } from '@/server/auth/activation-work-orders';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';

const paramsSchema = z.object({
  workOrderId: z.uuid(),
});

const bodySchema = z.object({
  reason: z.string().max(240).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await approveActivationWorkOrder({
      workOrderId: params.workOrderId,
      actorId: session.user.id,
      reason: body.reason ?? '客服审核通过',
    });

    return NextResponse.json({
      ok: true,
      workOrder: {
        id: result.workOrder.id,
        status: result.workOrder.status,
        approvedAt: result.workOrder.approvedAt,
      },
      user: {
        id: result.user.id,
        accountState: result.user.accountState,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: '激活工单审批请求无效。',
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
