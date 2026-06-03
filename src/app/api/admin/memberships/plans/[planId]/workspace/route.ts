import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { getMembershipPlanWorkspace } from '@/server/repositories/membership-plan-versions';
import { syncPermissionResourcesFromCatalog } from '@/server/repositories/permission-resources';

export async function GET(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdmin();
    await syncPermissionResourcesFromCatalog();
    const { planId } = await context.params;

    return NextResponse.json(await getMembershipPlanWorkspace(planId), { status: 200 });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
