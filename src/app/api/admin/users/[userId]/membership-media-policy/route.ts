import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { resyncAdminMembershipMediaPolicy } from '@/server/auth/admin-membership-media-policy';
import { requireAdmin } from '@/server/auth/guards';
import { recordAuditEvent } from '@/server/audit/audit-service';
import { createJsonResponse } from '@/server/encrypted-response';
import { adminText } from '@/features/admin/admin-i18n';

const paramsSchema = z.object({
  userId: z.uuid(),
});

export async function parseAdminMembershipMediaPolicyParams(
  params: Promise<{ userId: string }>,
) {
  return paramsSchema.parse(await params);
}

export function createAdminMembershipMediaPolicyRouteHandlers(dependencies: {
  requireAdminSession: typeof requireAdmin;
  readBody: typeof readJsonBody;
  resyncMediaPolicy: typeof resyncAdminMembershipMediaPolicy;
  recordAudit: typeof recordAuditEvent;
}) {
  return {
    async POST(
      request: Request,
      context: { params: Promise<{ userId: string }> },
    ) {
      try {
        const session = await dependencies.requireAdminSession();
        const params = await parseAdminMembershipMediaPolicyParams(context.params);
        const { rawBody, decryptedRawBody, body: parsedBody } = await dependencies.readBody(request);

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
            const resolution = await dependencies.resyncMediaPolicy(params.userId);

            await dependencies.recordAudit({
              actorId: session.user.id,
              targetId: params.userId,
              type: 'user.membership_media_quota_resynced',
              entityType: 'user',
              entityId: params.userId,
              metadata: {
                sourcePlanCode: resolution.sourcePlanCode,
                sourceVersionId: resolution.sourceVersionId,
                sourceVersionNumber: resolution.sourceVersionNumber,
                storageQuotaBytes: resolution.policy.storageQuotaBytes,
                allowUserUpload: resolution.policy.allowUserUpload,
                allowPublicSharing: resolution.policy.allowPublicSharing,
                updatedEntitlementCount: resolution.updatedEntitlementCount,
              },
            });

            return createJsonResponse({
              ok: true,
              quota: resolution.quota,
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
    },
  };
}

const handlers = createAdminMembershipMediaPolicyRouteHandlers({
  requireAdminSession: requireAdmin,
  readBody: readJsonBody,
  resyncMediaPolicy: resyncAdminMembershipMediaPolicy,
  recordAudit: recordAuditEvent,
});

export const POST = handlers.POST;
