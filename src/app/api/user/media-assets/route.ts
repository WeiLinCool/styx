import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAuthenticatedUserPermission } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';
import { createSaveGeneratedMediaService } from '@/server/media/save-generated-media';
import { createTencentCosClient } from '@/server/media/cos-client';
import { getUserStorageRepository } from '@/server/repositories/users';

const createSavedMediaBodySchema = z.object({
  runId: z.string().uuid('runId must be a valid UUID.'),
  artifactId: z.string().uuid('artifactId must be a valid UUID.'),
});

type SessionLike = {
  user: {
    id: string;
  };
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function createMediaAssetsRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  saveGeneratedMedia: (input: {
    userId: string;
    runId: string;
    artifactId: string;
  }) => Promise<Awaited<ReturnType<ReturnType<typeof createSaveGeneratedMediaService>['saveForUser']>>>;
  listSavedAssets: (userId: string) => Promise<
    Awaited<ReturnType<ReturnType<typeof getGeneratedMediaAssetRepository>['listSavedAssetsForUser']>>
  >;
}) {
  return {
    async GET() {
      try {
        const session = await dependencies.requireSession();
        const assets = await dependencies.listSavedAssets(session.user.id);
        return NextResponse.json({ assets });
      } catch (error) {
        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
    async POST(request: Request) {
      try {
        const session = await dependencies.requireSession();
        const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
        const body = createSavedMediaBodySchema.parse(parsedBody);

        return runProtectedMutation(
          {
            request,
            routeKind: 'user-mutation',
            operation: 'POST /api/user/media-assets',
            actorType: 'user',
            actorId: session.user.id,
            rawBody,
            decryptedRawBody,
            parsedBody: body,
          },
          async () => {
            const result = await dependencies.saveGeneratedMedia({
              userId: session.user.id,
              runId: body.runId,
              artifactId: body.artifactId,
            });

            return NextResponse.json({
              asset: result.asset,
              artifact: result.updatedArtifact,
            });
          },
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return jsonError('invalid_request', error.issues[0]?.message ?? '媒体保存请求无效。', 400);
        }

        const response = accountErrorToResponse(error);
        if (response.status !== 500) {
          return NextResponse.json(response.body, { status: response.status });
        }

        return jsonError(
          'media_save_failed',
          error instanceof Error ? error.message : '媒体保存失败。',
          400,
        );
      }
    },
  };
}

const handlers = createMediaAssetsRouteHandlers({
  requireSession: () => requireAuthenticatedUserPermission('api.user.media_assets.list'),
  saveGeneratedMedia: async (input) => {
    const service = createSaveGeneratedMediaService({
      runRepository: getAgentRunRepository(),
      mediaAssetRepository: getGeneratedMediaAssetRepository(),
      userStorageRepository: getUserStorageRepository(),
      cosClient: createTencentCosClient(),
      async fetchSource(url) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`无法获取待保存的媒体源，状态码 ${response.status}。`);
        }

        const buffer = new Uint8Array(await response.arrayBuffer());
        const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
        return {
          bytes: buffer,
          mimeType,
          byteSize: buffer.byteLength,
          width: null,
          height: null,
          durationSeconds: null,
        };
      },
      createObjectKey({ userId, conversationId, runId, assetId, mimeType }) {
        const ext =
          mimeType === 'image/png'
            ? '.png'
            : mimeType === 'image/jpeg'
              ? '.jpg'
              : mimeType === 'image/webp'
                ? '.webp'
                : mimeType === 'video/mp4'
                  ? '.mp4'
                  : '';

        return `ai-generated/${process.env.NODE_ENV ?? 'development'}/users/${userId}/conversations/${conversationId}/runs/${runId}/${assetId}${ext}`;
      },
    });

    return service.saveForUser(input);
  },
  listSavedAssets: (userId) => getGeneratedMediaAssetRepository().listSavedAssetsForUser(userId),
});

export const GET = handlers.GET;
export const POST = handlers.POST;
