import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { GeneratedMediaAssetDto } from '@/server/agent/types';
import { requireActiveAccount } from '@/server/auth/guards';
import { createSavedMediaAccessService } from '@/server/media/create-saved-media-access';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { createTencentCosClient } from '@/server/media/cos-client';

type SessionLike = {
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

export function createMediaAssetAccessRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  getSavedAsset: (assetId: string, userId: string) => Promise<GeneratedMediaAssetDto | null>;
  createAccessUrl: (input: {
    asset: GeneratedMediaAssetDto;
    disposition: 'preview' | 'download';
  }) => Promise<Awaited<ReturnType<ReturnType<typeof createSavedMediaAccessService>['createAccessUrl']>>>;
}) {
  return {
    async GET(request: Request, context: RouteContext) {
      const parsedQuery = accessQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );

      if (!parsedQuery.success) {
        return jsonError('invalid_request', parsedQuery.error.issues[0]?.message ?? 'Invalid request.', 400);
      }

      const session = await dependencies.requireSession();
      const { assetId } = await context.params;
      const asset = await dependencies.getSavedAsset(assetId, session.user.id);

      if (!asset) {
        return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
      }

      const access = await dependencies.createAccessUrl({
        asset,
        disposition: parsedQuery.data.disposition,
      });

      return NextResponse.json({ access });
    },
  };
}

const handlers = createMediaAssetAccessRouteHandlers({
  requireSession: requireActiveAccount,
  getSavedAsset: (assetId, userId) =>
    getGeneratedMediaAssetRepository().getSavedAssetForUser(assetId, userId),
  createAccessUrl: async ({ asset, disposition }) => {
    const cosClient = createTencentCosClient();
    const accessService = createSavedMediaAccessService({
      async signObjectUrl({ objectKey }) {
        return {
          url: await cosClient.createSignedReadUrl(objectKey),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        };
      },
    });

    return accessService.createAccessUrl({
      asset,
      disposition,
    });
  },
});

export const GET = handlers.GET;
