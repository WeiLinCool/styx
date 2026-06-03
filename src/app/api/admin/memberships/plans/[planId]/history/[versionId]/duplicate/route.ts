import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { duplicateMembershipPlanVersionAsDraftInDb } from '@/server/repositories/membership-plan-versions';

export async function POST(
  _request: Request,
  context: { params: Promise<{ planId: string; versionId: string }> },
) {
  try {
    await requireAdmin();
    const { planId, versionId } = await context.params;

    return NextResponse.json(await duplicateMembershipPlanVersionAsDraftInDb(planId, versionId), {
      status: 200,
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
