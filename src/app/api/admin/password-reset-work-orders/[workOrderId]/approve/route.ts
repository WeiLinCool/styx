import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { approvePasswordResetWorkOrder } from '@/server/auth/password-reset-work-orders';
import { requireAdmin } from '@/server/auth/guards';
import { runProtectedMutation } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const session = await requireAdmin();
    const { workOrderId } = await context.params;
    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/password-reset-work-orders/[workOrderId]/approve',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody: '',
        parsedBody: null,
      },
      async () => {
        const workOrder = await approvePasswordResetWorkOrder({
          workOrderId,
          actorId: session.user.id,
        });
        return createJsonResponse({ ok: true, workOrder });
      },
    );
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
