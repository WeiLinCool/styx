import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { resolveCurrentUserMediaPolicy } from '@/server/auth/membership-media-policy';
import { recordAuditEvent } from '@/server/audit/audit-service';
import { createJsonResponse } from '@/server/encrypted-response';
import { applyMembershipMediaQuota } from '@/server/repositories/users';
import { adminText } from '@/features/admin/admin-i18n';

const paramsSchema = z.object({
  userId: z.uuid(),
});

export async function parseAdminMembershipMediaPolicyParams(
  params: Promise<{ userId: string }>,
) {
  return paramsSchema.parse(await params);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = await parseAdminMembershipMediaPolicyParams(context.params);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/users/[userId]/membership-media-policy',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const policy = await resolveCurrentUserMediaPolicy(params.userId);
        const quota = await applyMembershipMediaQuota(
          params.userId,
          policy.storageQuotaBytes,
        );

        await recordAuditEvent({
          actorId: session.user.id,
          targetId: params.userId,
          type: 'user.membership_media_quota_resynced',
          entityType: 'user',
          entityId: params.userId,
          metadata: {
            storageQuotaBytes: policy.storageQuotaBytes,
            allowUserUpload: policy.allowUserUpload,
            allowPublicSharing: policy.allowPublicSharing,
          },
        });

        return createJsonResponse({
          ok: true,
          quota,
        });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
            error: {
              code: 'validation_error',
              message: adminText.api.membershipMediaPolicyInvalid,
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
