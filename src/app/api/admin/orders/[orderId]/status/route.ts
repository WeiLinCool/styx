import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import {
  addOrderNote,
  updateOrderStatus,
  type OrderStatus,
} from '@/server/repositories/admin-mutations';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';

const paramsSchema = z.object({
  orderId: z.uuid(),
});

const bodySchema = z.union([
  z.object({
    action: z.literal('add_note'),
    note: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('update_status'),
    status: z.enum(['pending', 'paid', 'fulfilled', 'cancelled', 'refunded']),
    note: z.string().trim().max(1000).optional(),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/orders/[orderId]/status',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const order =
          body.action === 'add_note'
            ? await addOrderNote({
                orderId: params.orderId,
                actorId: session.user.id,
                note: body.note,
              })
            : await updateOrderStatus({
                orderId: params.orderId,
                status: body.status as OrderStatus,
                actorId: session.user.id,
                note: body.note,
              });

        return NextResponse.json({
          ok: true,
          order: {
            id: order.id,
            status: order.status,
            updatedAt: order.updatedAt,
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
            message: 'Order status request is invalid.',
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
