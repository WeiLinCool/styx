import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireActiveAccount } from '@/server/auth/guards';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
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

const updateSavedAssetTitleSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空。').max(100, '标题最多100个字符。'),
});

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
  updateSavedAssetTitle: (
    assetId: string,
    userId: string,
    title: string,
  ) => Promise<Awaited<ReturnType<ReturnType<typeof getGeneratedMediaAssetRepository>['updateSavedAssetTitleForUser']>>>;
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
    async PATCH(request: Request, context: RouteContext) {
      try {
        const session = await dependencies.requireSession();
        const { assetId } = await context.params;
        const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
        const body = updateSavedAssetTitleSchema.parse(parsedBody);

        return await runProtectedMutation(
          {
            request,
            routeKind: 'user-mutation',
            operation: 'PATCH /api/user/media-assets/[assetId]',
            actorType: 'user',
            actorId: session.user.id,
            rawBody,
            decryptedRawBody,
            parsedBody: body,
          },
          async () => {
            const asset = await dependencies.updateSavedAssetTitle(assetId, session.user.id, body.title);

            if (!asset) {
              return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
            }

            return NextResponse.json({ asset });
          },
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return jsonError('invalid_request', error.issues[0]?.message ?? '请求参数无效。', 400);
        }

        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
  };
}

const handlers = createMediaAssetByIdRouteHandlers({
  requireSession: requireActiveAccount,
  getSavedAsset: (assetId, userId) =>
    getGeneratedMediaAssetRepository().getSavedAssetForUser(assetId, userId),
  deleteSavedAsset: (assetId, userId) =>
    getGeneratedMediaAssetRepository().softDeleteSavedAssetForUser(assetId, userId),
  updateSavedAssetTitle: (assetId, userId, title) =>
    getGeneratedMediaAssetRepository().updateSavedAssetTitleForUser(assetId, userId, title),
});

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
export const PATCH = handlers.PATCH;
