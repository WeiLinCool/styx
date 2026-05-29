import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { archivePasswordResetWorkOrder } from '@/server/auth/password-reset-work-orders';
import { requireAdmin } from '@/server/auth/guards';

export async function POST(
  _request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const session = await requireAdmin();
    const { workOrderId } = await context.params;
    const workOrder = await archivePasswordResetWorkOrder({
      workOrderId,
      actorId: session.user.id,
    });
    return NextResponse.json({ ok: true, workOrder });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
