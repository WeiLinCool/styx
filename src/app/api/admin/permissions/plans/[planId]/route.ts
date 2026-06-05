import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { invalidateUserPermissionCacheForPlan } from '@/server/auth/permission-service';
import {
  listMembershipPlanPermissionWorkspaceByPlanId,
  replaceMembershipPlanPermissionBindingsByPlanId,
} from '@/server/repositories/membership-plan-permissions';
import { syncPermissionResourcesFromCatalog } from '@/server/repositories/permission-resources';
import { adminText } from '@/features/admin/admin-i18n';

const bodySchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1)).max(500),
});

export function parsePlanPermissionUpdateBody(body: unknown) {
  return bodySchema.parse(body);
}

export async function parsePlanPermissionUpdateRequest(request: Request) {
  const { body } = await readJsonBody(request);
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
    const session = await requireAdmin();
    await syncPermissionResourcesFromCatalog();
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = parsePlanPermissionUpdateBody(parsedBody);
    const { planId } = await context.params;

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'PUT /api/admin/permissions/plans/[planId]',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody: body,
      },
      async () => {
        const result = await replaceMembershipPlanPermissionBindingsByPlanId({
          planId,
          permissionCodes: body.permissionCodes,
        });
        await invalidateUserPermissionCacheForPlan(planId);

        return NextResponse.json(result, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
            error: {
              code: 'validation_error',
              message: adminText.api.permissionUpdateInvalid,
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
