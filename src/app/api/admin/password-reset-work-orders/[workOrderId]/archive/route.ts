import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { archivePasswordResetWorkOrder } from '@/server/auth/password-reset-work-orders';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createJsonResponse } from '@/server/encrypted-response';

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const session = await requireAdmin();
    const { workOrderId } = await context.params;
    const parsed = await readJsonBody(request);
    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/password-reset-work-orders/[workOrderId]/archive',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody: parsed.rawBody,
        decryptedRawBody: parsed.decryptedRawBody,
        parsedBody: parsed.body,
      },
      async () => {
        const workOrder = await archivePasswordResetWorkOrder({
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
