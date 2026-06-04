import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { invalidateUserPermissionCacheForPlan } from '@/server/auth/permission-service';
import { scheduleMembershipPlanDraftInDb } from '@/server/repositories/membership-plan-versions';

const bodySchema = z.object({
  effectiveFrom: z.string().datetime(),
});

export async function parseMembershipScheduleBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    const session = await requireAdmin();
    const body = await parseMembershipScheduleBody(request);
    const { planId } = await context.params;

    const scheduled = await scheduleMembershipPlanDraftInDb(planId, {
      effectiveFrom: body.effectiveFrom,
      actorId: session.user.id,
    });
    await invalidateUserPermissionCacheForPlan(planId);

    return NextResponse.json(scheduled, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Membership schedule request is invalid.',
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
