import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import {
  listMembershipPlanPermissionWorkspaceByPlanId,
  replaceMembershipPlanPermissionBindingsByPlanId,
} from '@/server/repositories/membership-plan-permissions';
import { syncPermissionResourcesFromCatalog } from '@/server/repositories/permission-resources';

const bodySchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1)).max(500),
});

export async function parsePlanPermissionUpdateBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdmin();
    await syncPermissionResourcesFromCatalog();
    const { planId } = await context.params;

    return NextResponse.json(await listMembershipPlanPermissionWorkspaceByPlanId(planId), {
      status: 200,
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdmin();
    await syncPermissionResourcesFromCatalog();
    const body = await parsePlanPermissionUpdateBody(request);
    const { planId } = await context.params;

    const result = await replaceMembershipPlanPermissionBindingsByPlanId({
      planId,
      permissionCodes: body.permissionCodes,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Plan permission update request is invalid.',
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
