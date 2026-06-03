import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { publishMembershipPlanDraftInDb } from '@/server/repositories/membership-plan-versions';

export async function POST(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    const session = await requireAdmin();
    const { planId } = await context.params;

    return NextResponse.json(
      await publishMembershipPlanDraftInDb(planId, { actorId: session.user.id }),
      { status: 200 },
    );
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
