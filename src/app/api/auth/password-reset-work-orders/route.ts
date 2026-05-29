import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { createPasswordResetWorkOrder } from '@/server/auth/password-reset-work-orders';

const bodySchema = z.object({
  phone: z.string().min(6).max(32),
  reason: z.string().max(240).optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const workOrder = await createPasswordResetWorkOrder({
      phone: body.phone,
      reason: body.reason,
    });

    return NextResponse.json({
      ok: true,
      workOrderId: workOrder.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: '重置密码工单请求无效。',
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
