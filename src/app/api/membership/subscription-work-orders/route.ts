import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { createSubscriptionWorkOrder } from '@/server/auth/subscription-work-orders';

const bodySchema = z.object({
  planCode: z.enum(['pro-monthly', 'team-yearly']),
  paymentMethod: z.string().trim().min(1).max(80),
  amountCents: z.number().int().min(0).max(10_000_000),
  paidAt: z.iso.datetime(),
  reference: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireActiveAccount();
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/membership/subscription-work-orders',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody: body,
      },
      async () => {
        const subscriptionWorkOrder = await createSubscriptionWorkOrder({
          userId: session.user.id,
          planCode: body.planCode,
          submittedPaymentMethod: body.paymentMethod,
          submittedAmountCents: body.amountCents,
          submittedPaidAt: new Date(body.paidAt),
          submittedReference: body.reference,
          submittedNote: body.note ?? null,
        });

        return NextResponse.json({ ok: true, subscriptionWorkOrder });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Subscription work order request is invalid.',
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
