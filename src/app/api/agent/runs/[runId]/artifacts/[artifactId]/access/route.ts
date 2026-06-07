import { NextResponse } from 'next/server';

import type {
  AgentArtifactDto,
  AgentRunDetailDto,
  GeneratedMediaAssetDto,
} from '@/server/agent/types';
import { requireActiveAccount } from '@/server/auth/guards';
import { createSavedMediaAccessService } from '@/server/media/create-saved-media-access';
import { createDefaultGeneratedMediaCacheService } from '@/server/media/generated-media-cache';
import { createTencentCosClient } from '@/server/media/cos-client';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';

type SessionLike = {
  user: {
    id: string;
  };
};

type RouteContext = {
  params: Promise<{
    runId: string;
    artifactId: string;
  }>;
};

type ArtifactAccessDisposition = 'preview' | 'download';

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseArtifactAccessDisposition(value: string | null): ArtifactAccessDisposition {
  if (value === null || value === '') {
    return 'preview';
  }
  if (value === 'preview' || value === 'download') {
    return value;
  }
  throw new Error('Invalid disposition.');
}

function readGeneratedMediaArtifact(
  detail: AgentRunDetailDto,
  artifactId: string,
): AgentArtifactDto | null {
  return (
    detail.run.artifacts.find(
      (artifact) =>
        artifact.id === artifactId &&
        (artifact.kind === 'image' || artifact.kind === 'video'),
    ) ?? null
  );
}

export function createGeneratedRunArtifactAccessRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  getRunDetail: (runId: string, userId: string) => Promise<AgentRunDetailDto | null>;
  createCachedAccess: (input: {
    objectKey: string;
    expiresInSeconds?: number;
  }) => Promise<{ url: string; expiresAt: string }>;
  getSavedAsset?: (assetId: string, userId: string) => Promise<GeneratedMediaAssetDto | null>;
  createSavedAccess?: (input: {
    asset: GeneratedMediaAssetDto;
    disposition: ArtifactAccessDisposition;
  }) => Promise<{ url: string; expiresAt: string; mimeType: string | null }>;
  now?: () => Date;
}) {
  return {
    async GET(request: Request, context: RouteContext) {
      let disposition: ArtifactAccessDisposition;
      try {
        disposition = parseArtifactAccessDisposition(
          new URL(request.url).searchParams.get('disposition'),
        );
      } catch (error) {
        return jsonError(
          'invalid_request',
          error instanceof Error ? error.message : 'Invalid request.',
          400,
        );
      }

      const session = await dependencies.requireSession();
      const { runId, artifactId } = await context.params;
      const detail = await dependencies.getRunDetail(runId, session.user.id);
      if (!detail) {
        return jsonError('run_not_found', 'Agent run was not found.', 404);
      }

      const artifact = readGeneratedMediaArtifact(detail, artifactId);
      if (!artifact) {
        return jsonError(
          'artifact_not_found',
          'Generated media artifact was not found.',
          404,
        );
      }

      const savedAssetId = readString(artifact.metadata, 'savedAssetId');
      if (savedAssetId && dependencies.getSavedAsset && dependencies.createSavedAccess) {
        const asset = await dependencies.getSavedAsset(savedAssetId, session.user.id);
        if (!asset) {
          return jsonError('asset_not_found', 'Saved media asset was not found.', 404);
        }
        const access = await dependencies.createSavedAccess({ asset, disposition });
        return NextResponse.json({
          access: {
            runId,
            artifactId,
            savedAssetId,
            disposition,
            ...access,
          },
        });
      }

      const objectKey = readString(artifact.metadata, 'cacheObjectKey');
      if (!objectKey) {
        const sourceUrl = readString(artifact.metadata, 'sourceUrl');
        if (!sourceUrl) {
          return jsonError(
            'cache_unavailable',
            'Temporary generated media is unavailable.',
            410,
          );
        }

        const providerExpiresAt = readString(artifact.metadata, 'providerExpiresAt');
        if (
          providerExpiresAt &&
          new Date(providerExpiresAt).getTime() <= (dependencies.now?.() ?? new Date()).getTime()
        ) {
          return jsonError(
            'cache_expired',
            'Temporary generated media has expired.',
            410,
          );
        }

        return NextResponse.json({
          access: {
            runId,
            artifactId,
            disposition,
            url: sourceUrl,
            expiresAt: providerExpiresAt,
            mimeType: readString(artifact.metadata, 'mimeType'),
          },
        });
      }

      const cacheExpiresAt = readString(artifact.metadata, 'cacheExpiresAt');
      if (
        cacheExpiresAt &&
        new Date(cacheExpiresAt).getTime() <= (dependencies.now?.() ?? new Date()).getTime()
      ) {
        return jsonError(
          'cache_expired',
          'Temporary generated media has expired.',
          410,
        );
      }

      const signed = await dependencies.createCachedAccess({
        objectKey,
        expiresInSeconds: 600,
      });

      return NextResponse.json({
        access: {
          runId,
          artifactId,
          disposition,
          url: signed.url,
          expiresAt: signed.expiresAt,
          mimeType: readString(artifact.metadata, 'mimeType'),
        },
      });
    },
  };
}

const handlers = createGeneratedRunArtifactAccessRouteHandlers({
  requireSession: requireActiveAccount,
  getRunDetail: (runId, userId) =>
    getAgentRunRepository().getRunDetailForUser(runId, userId),
  createCachedAccess: (input) =>
    createDefaultGeneratedMediaCacheService().createPreviewAccess(input),
  getSavedAsset: (assetId, userId) =>
    getGeneratedMediaAssetRepository().getSavedAssetForUser(assetId, userId),
  createSavedAccess: async ({ asset, disposition }) => {
    const cosClient = createTencentCosClient();
    const service = createSavedMediaAccessService({
      async signObjectUrl({ objectKey }) {
        return {
          url: await cosClient.createSignedReadUrl(objectKey),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        };
      },
    });
    return service.createAccessUrl({ asset, disposition });
  },
});

export const GET = handlers.GET;
