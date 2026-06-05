import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { recordAuditEvent } from '@/server/audit/audit-service';
import { createTencentCosClient } from '@/server/media/cos-client';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { adminText } from '@/features/admin/admin-i18n';

type AdminSessionLike = {
  user: {
    id: string;
  };
};

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

const accessQuerySchema = z.object({
  disposition: z.enum(['preview', 'download']).default('preview'),
});

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function createAdminMediaAssetAccessRouteHandlers(dependencies: {
  requireAdminSession: () => Promise<AdminSessionLike>;
  getAssetForAdmin: (assetId: string) => Promise<
    Awaited<ReturnType<ReturnType<typeof getGeneratedMediaAssetRepository>['getSavedAssetForAdmin']>>
  >;
  createAccessUrl: (input: {
    assetId: string;
    objectKey: string;
    mimeType: string | null;
    disposition: 'preview' | 'download';
  }) => Promise<{
    assetId: string;
    disposition: 'preview' | 'download';
    url: string;
    expiresAt: string;
    mimeType: string | null;
  }>;
  recordAudit: (input: {
    actorId: string;
    targetId: string;
    type: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}) {
  return {
    async GET(request: Request, context: RouteContext) {
      const parsedQuery = accessQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (!parsedQuery.success) {
        return jsonError(
          'invalid_request',
          parsedQuery.error.issues[0]?.message ?? adminText.api.mediaAssetAccessInvalid,
          400,
        );
      }

      try {
        const session = await dependencies.requireAdminSession();
        const { assetId } = await context.params;
        const asset = await dependencies.getAssetForAdmin(assetId);

        if (!asset || asset.status !== 'ready' || asset.deletedAt) {
          return jsonError('asset_not_found', adminText.api.mediaAssetNotFound, 404);
        }

        const access = await dependencies.createAccessUrl({
          assetId: asset.id,
          objectKey: asset.objectKey,
          mimeType: asset.mimeType,
          disposition: parsedQuery.data.disposition,
        });

        await dependencies.recordAudit({
          actorId: session.user.id,
          targetId: asset.userId,
          type: 'admin.media_asset.accessed',
          entityType: 'media_asset',
          entityId: asset.id,
          metadata: { disposition: parsedQuery.data.disposition },
        });

        return NextResponse.json({ access });
      } catch (error) {
        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
  };
}

const handlers = createAdminMediaAssetAccessRouteHandlers({
  requireAdminSession: requireAdmin,
  getAssetForAdmin: (assetId) => getGeneratedMediaAssetRepository().getSavedAssetForAdmin(assetId),
  createAccessUrl: async ({ assetId, objectKey, mimeType, disposition }) => ({
    assetId,
    disposition,
    url: await createTencentCosClient().createSignedReadUrl(objectKey),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    mimeType,
  }),
  recordAudit: async (input) => {
    await recordAuditEvent(input);
  },
});

export const GET = handlers.GET;
