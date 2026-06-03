import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { createOrUpdateMembershipPlanDraft } from '@/server/repositories/membership-plan-versions';
import { syncPermissionResourcesFromCatalog } from '@/server/repositories/permission-resources';

const membershipDraftSchema = z.object({
  displayName: z.string().trim().min(1),
  description: z.string().trim().max(2000).nullable().optional().default(null),
  billingPeriod: z.enum(['month', 'year', 'one_time']),
  priceCents: z.number().int().min(0),
  currency: z.string().trim().min(1).default('CNY'),
  changeSummary: z.string().trim().max(500).nullable().optional().default(null),
  permissionCodes: z.array(z.string().trim().min(1)).max(500),
  benefits: z.array(
    z.object({
      code: z.string().trim().min(1),
      name: z.string().trim().min(1),
      kind: z.enum(['quota', 'feature', 'discount', 'support']),
      quantity: z.number().int().nullable().optional().default(null),
      unit: z.string().trim().nullable().optional().default(null),
    }),
  ),
});

export async function parseMembershipDraftBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return membershipDraftSchema.parse(body);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdmin();
    await syncPermissionResourcesFromCatalog();
    const body = await parseMembershipDraftBody(request);
    const { planId } = await context.params;

    return NextResponse.json(
      await createOrUpdateMembershipPlanDraft({
        planId,
        displayName: body.displayName,
        description: body.description,
        billingPeriod: body.billingPeriod,
        priceCents: body.priceCents,
        currency: body.currency,
        changeSummary: body.changeSummary,
        benefits: body.benefits,
        permissionCodes: body.permissionCodes,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Membership draft request is invalid.',
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
