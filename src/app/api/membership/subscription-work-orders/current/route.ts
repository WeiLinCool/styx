import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { getCurrentSubscriptionWorkOrderSummary } from '@/server/repositories/subscription-work-orders';

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const subscriptionWorkOrder = await getCurrentSubscriptionWorkOrderSummary(session.user.id);

    return NextResponse.json({
      ok: true,
      subscriptionWorkOrder,
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
