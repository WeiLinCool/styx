import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { invalidateUserPermissionCacheForVersion } from '@/server/auth/permission-service';
import { readJsonBody } from '@/server/api-request-guard';
import { createOrUpdateMembershipPlanDraft } from '@/server/repositories/membership-plan-versions';
import { syncPermissionResourcesFromCatalog } from '@/server/repositories/permission-resources';
import { adminText } from '@/features/admin/admin-i18n';

const videoGenerationPolicySchema = z
  .object({
    enabled: z.boolean(),
    allowedDurations: z.array(z.coerce.number().int().positive()).min(1),
    allowedResolutions: z.array(z.string().trim().min(1)).min(1),
    defaultDuration: z.coerce.number().int().positive(),
    defaultResolution: z.string().trim().min(1),
  })
  .superRefine((policy, context) => {
    if (!policy.allowedDurations.includes(policy.defaultDuration)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultDuration'],
        message: 'Default duration must be included in allowed durations.',
      });
    }

    if (!policy.allowedResolutions.includes(policy.defaultResolution)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultResolution'],
        message: 'Default resolution must be included in allowed resolutions.',
      });
    }
  });

const membershipDraftSchema = z.object({
  displayName: z.string().trim().min(1),
  description: z.string().trim().max(2000).nullable().optional().default(null),
  billingPeriod: z.enum(['month', 'year', 'one_time']),
  priceCents: z.coerce.number().int().min(0),
  currency: z.string().trim().min(1).default('CNY'),
  changeSummary: z.string().trim().max(500).nullable().optional().default(null),
  permissionCodes: z.array(z.string().trim().min(1)).max(500),
  benefits: z.array(
    z.object({
      code: z.string().trim().min(1),
      name: z.string().trim().min(1),
      kind: z.enum(['quota', 'feature', 'discount', 'support']),
      quantity: z.coerce.number().int().nullable().optional().default(null),
      unit: z.string().trim().nullable().optional().default(null),
    }),
  ),
  mediaLibraryPolicy: z.object({
    storageQuotaBytes: z.coerce.number().int().nonnegative(),
    allowUserUpload: z.boolean(),
    allowPublicSharing: z.boolean(),
  }),
  videoGenerationPolicy: videoGenerationPolicySchema
    .nullable()
    .optional()
    .default(null),
});

export function parseMembershipDraftBody(input: unknown) {
  return membershipDraftSchema.parse(input);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdmin();
    await syncPermissionResourcesFromCatalog();
    const { body: parsedBody } = await readJsonBody(request);
    const body = parseMembershipDraftBody(parsedBody);
    const { planId } = await context.params;

    const draft = await createOrUpdateMembershipPlanDraft({
        planId,
        displayName: body.displayName,
        description: body.description,
        billingPeriod: body.billingPeriod,
        priceCents: body.priceCents,
        currency: body.currency,
        changeSummary: body.changeSummary,
        benefits: body.benefits,
        mediaLibraryPolicy: body.mediaLibraryPolicy,
        videoGenerationPolicy: body.videoGenerationPolicy,
        permissionCodes: body.permissionCodes,
      });
    await invalidateUserPermissionCacheForVersion(draft.id);

    return NextResponse.json(draft, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: adminText.api.membershipDraftInvalid,
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
