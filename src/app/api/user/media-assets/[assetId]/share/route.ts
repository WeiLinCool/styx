import { NextResponse } from 'next/server';

import { requireActiveAccount } from '@/server/auth/guards';
import { resolveCurrentUserMediaPolicy } from '@/server/auth/membership-media-policy';
import { createPublicMediaShareService } from '@/server/media/create-public-media-share';
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

export function createMediaAssetShareRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  resolveMediaPolicy: (userId: string) => Promise<{
    storageQuotaBytes: number;
    allowUserUpload: boolean;
    allowPublicSharing: boolean;
  }>;
  enableShare: (
    assetId: string,
    userId: string,
  ) => Promise<{ asset: unknown; share: { shareId: string; url: string } } | null>;
  disableShare: (assetId: string, userId: string) => Promise<unknown | null>;
}) {
  return {
    async POST(_request: Request, context: RouteContext) {
      const session = await dependencies.requireSession();
      const policy = await dependencies.resolveMediaPolicy(session.user.id);
      if (!policy.allowPublicSharing) {
        return jsonError(
          'membership_media_share_forbidden',
          '当前会员权益不支持公开分享。',
          403,
        );
      }

      const { assetId } = await context.params;
      const result = await dependencies.enableShare(assetId, session.user.id);
      if (!result) {
        return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
      }

      return NextResponse.json(result);
    },
    async DELETE(_request: Request, context: RouteContext) {
      const session = await dependencies.requireSession();
      const { assetId } = await context.params;
      const asset = await dependencies.disableShare(assetId, session.user.id);
      if (!asset) {
        return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
      }

      return NextResponse.json({ asset });
    },
  };
}

const handlers = createMediaAssetShareRouteHandlers({
  requireSession: requireActiveAccount,
  resolveMediaPolicy: resolveCurrentUserMediaPolicy,
  enableShare: async (assetId, userId) => {
    const repository = getGeneratedMediaAssetRepository();
    const shareService = createPublicMediaShareService({
      buildShareUrl: (shareId) => `/shared/media/${shareId}`,
    });
    const share = shareService.createShareMetadata();
    const asset = await repository.enableSharingForUser(assetId, userId, {
      shareId: share.shareId,
      sharedAt: share.sharedAt,
    });

    return asset
      ? {
          asset,
          share: { shareId: share.shareId, url: share.url },
        }
      : null;
  },
  disableShare: (assetId, userId) =>
    getGeneratedMediaAssetRepository().disableSharingForUser(assetId, userId),
});

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
