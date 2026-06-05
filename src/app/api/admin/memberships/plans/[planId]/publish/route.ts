import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { invalidateUserPermissionCacheForPlan } from '@/server/auth/permission-service';
import { publishMembershipPlanDraftInDb } from '@/server/repositories/membership-plan-versions';

export async function POST(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdmin();
    const { planId } = await context.params;

    const published = await publishMembershipPlanDraftInDb(planId);
    await invalidateUserPermissionCacheForPlan(planId);

    return NextResponse.json(published, { status: 200 });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
