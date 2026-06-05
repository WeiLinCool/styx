import { NextResponse } from 'next/server';

import { createTencentCosClient } from '@/server/media/cos-client';
import { createPublicMediaShareService } from '@/server/media/create-public-media-share';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';

type RouteContext = {
  params: Promise<{
    shareId: string;
  }>;
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function createPublicMediaShareRouteHandlers(dependencies: {
  getSharedMedia: (shareId: string) => Promise<{ asset: unknown; access: unknown } | null>;
}) {
  return {
    async GET(_request: Request, context: RouteContext) {
      const { shareId } = await context.params;
      const result = await dependencies.getSharedMedia(shareId);
      if (!result) {
        return jsonError('share_not_found', 'Shared media asset was not found.', 404);
      }

      return NextResponse.json(result);
    },
  };
}

const handlers = createPublicMediaShareRouteHandlers({
  getSharedMedia: async (shareId) => {
    const repository = getGeneratedMediaAssetRepository();
    const asset = await repository.getActiveSharedAssetByShareId(shareId);
    if (!asset) {
      return null;
    }

    const shareService = createPublicMediaShareService({
      buildShareUrl: (nextShareId) => `/shared/media/${nextShareId}`,
      signObjectUrl: async ({ objectKey }) => ({
        url: await createTencentCosClient().createSignedReadUrl(objectKey),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    });

    return shareService.createPublicPayload({ asset });
  },
});

export const GET = handlers.GET;
