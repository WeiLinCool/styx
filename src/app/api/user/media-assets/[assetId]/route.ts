import { NextResponse } from 'next/server';

import { requireActiveAccount } from '@/server/auth/guards';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';

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

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function createMediaAssetByIdRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  getSavedAsset: (
    assetId: string,
    userId: string,
  ) => Promise<Awaited<ReturnType<ReturnType<typeof getGeneratedMediaAssetRepository>['getSavedAssetForUser']>>>;
  deleteSavedAsset: (
    assetId: string,
    userId: string,
  ) => Promise<Awaited<ReturnType<ReturnType<typeof getGeneratedMediaAssetRepository>['softDeleteSavedAssetForUser']>>>;
}) {
  return {
    async GET(_request: Request, context: RouteContext) {
      const session = await dependencies.requireSession();
      const { assetId } = await context.params;
      const asset = await dependencies.getSavedAsset(assetId, session.user.id);

      if (!asset) {
        return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
      }

      return NextResponse.json({ asset });
    },
    async DELETE(_request: Request, context: RouteContext) {
      const session = await dependencies.requireSession();
      const { assetId } = await context.params;
      const asset = await dependencies.deleteSavedAsset(assetId, session.user.id);

      if (!asset) {
        return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
      }

      return NextResponse.json({ asset });
    },
  };
}

const handlers = createMediaAssetByIdRouteHandlers({
  requireSession: requireActiveAccount,
  getSavedAsset: (assetId, userId) =>
    getGeneratedMediaAssetRepository().getSavedAssetForUser(assetId, userId),
  deleteSavedAsset: (assetId, userId) =>
    getGeneratedMediaAssetRepository().softDeleteSavedAssetForUser(assetId, userId),
});

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
