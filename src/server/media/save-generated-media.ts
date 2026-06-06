import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { AgentArtifactDto, GeneratedMediaAssetDto } from '@/server/agent/types';
import type { GeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import type { AgentRunRepository } from '@/server/repositories/agent-runs';
import type { UserStorageRepository } from '@/server/repositories/users';

type DownloadedMedia = {
  bytes: Uint8Array;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

type CosUploadResult = {
  bucket: string;
  region: string;
  objectKey: string;
};

type SaveGeneratedMediaDependencies = {
  runRepository: AgentRunRepository;
  mediaAssetRepository: GeneratedMediaAssetRepository;
  userStorageRepository: UserStorageRepository;
  cosClient: {
    uploadObject(input: {
      objectKey: string;
      body: Uint8Array;
      contentType: string;
    }): Promise<CosUploadResult>;
    deleteObject(objectKey: string): Promise<void>;
  };
  promoteCachedObject?: (input: {
    sourceObjectKey: string;
    targetObjectKey: string;
    contentType: string;
  }) => Promise<CosUploadResult>;
  fetchSource(url: string): Promise<DownloadedMedia>;
  createObjectKey(input: {
    userId: string;
    conversationId: string;
    runId: string;
    assetId: string;
    mimeType: string;
  }): string;
  now?: () => Date;
};

type SaveGeneratedMediaInput = {
  userId: string;
  runId: string;
  artifactId: string;
};

type SaveGeneratedMediaResult = {
  asset: GeneratedMediaAssetDto;
  updatedArtifact: AgentArtifactDto;
};

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveNumber(record: Record<string, unknown>, key: string) {
  const value = readNumber(record, key);
  return value !== null && value > 0 ? value : null;
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'video/mp4') return '.mp4';
  return '';
}

function inferObjectKey(input: {
  userId: string;
  conversationId: string;
  runId: string;
  assetId: string;
  mimeType: string;
}) {
  const ext = extensionFromMimeType(input.mimeType);
  return path.posix.join(
    'ai-generated',
    process.env.NODE_ENV ?? 'development',
    'users',
    input.userId,
    'conversations',
    input.conversationId,
    'runs',
    input.runId,
    `${input.assetId}${ext}`,
  );
}

function readSaveEligibleArtifact(
  artifacts: AgentArtifactDto[],
  artifactId: string,
): AgentArtifactDto | null {
  return artifacts.find(
    (artifact) =>
      artifact.id === artifactId && (artifact.kind === 'image' || artifact.kind === 'video'),
  ) ?? null;
}

function isExpired(expiresAt: string, now: Date) {
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function readCachedMedia(metadata: Record<string, unknown>, now: Date) {
  if (metadata.storageStatus !== 'cached' || metadata.cacheStatus !== 'available') {
    return null;
  }

  const objectKey = readString(metadata, 'cacheObjectKey');
  const expiresAt = readString(metadata, 'cacheExpiresAt');
  const mimeType = readString(metadata, 'mimeType');
  const byteSize = readPositiveNumber(metadata, 'byteLength') ?? readPositiveNumber(metadata, 'byteSize');
  if (!objectKey || !expiresAt || !mimeType || byteSize === null) {
    return null;
  }

  return {
    objectKey,
    expiresAt,
    expired: isExpired(expiresAt, now),
    mimeType,
    byteSize,
    width: readNumber(metadata, 'width'),
    height: readNumber(metadata, 'height'),
    durationSeconds: readNumber(metadata, 'durationSeconds'),
  };
}

export function createSaveGeneratedMediaService(dependencies: SaveGeneratedMediaDependencies) {
  return {
    dependencies,
    async saveForUser(input: SaveGeneratedMediaInput): Promise<SaveGeneratedMediaResult> {
      const existing = await dependencies.mediaAssetRepository.findSavedAssetBySource(input);
      if (existing) {
        const detail = await dependencies.runRepository.getRunDetailForUser(input.runId, input.userId);
        const artifact = readSaveEligibleArtifact(detail?.run.artifacts ?? [], input.artifactId);
        if (!artifact) {
          throw new Error('生成结果不存在或不可保存。');
        }

        if (artifact.metadata.savedAssetId !== existing.id) {
          await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
            saveStatus: 'saved',
            savedAssetId: existing.id,
          });
        }

        const updatedDetail = await dependencies.runRepository.getRunDetailForUser(input.runId, input.userId);
        const updatedArtifact = readSaveEligibleArtifact(updatedDetail?.run.artifacts ?? [], input.artifactId);
        if (!updatedArtifact) {
          throw new Error('生成结果不存在或不可保存。');
        }

        return { asset: existing, updatedArtifact };
      }

      const detail = await dependencies.runRepository.getRunDetailForUser(input.runId, input.userId);
      const run = detail?.run;
      if (!run) {
        throw new Error('生成记录不存在。');
      }

      const artifact = readSaveEligibleArtifact(run.artifacts, input.artifactId);
      if (!artifact) {
        throw new Error('生成结果不存在或不可保存。');
      }

      const metadata = artifact.metadata;
      const sourceUrl = readString(metadata, 'sourceUrl');
      const cachedMedia = readCachedMedia(metadata, dependencies.now?.() ?? new Date());
      if (cachedMedia?.expired && !sourceUrl) {
        await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
          saveStatus: 'source_expired',
          saveError: 'cache_expired',
        });
        throw new Error('源文件已失效，无法保存到我的媒体。');
      }

      const quota = await dependencies.userStorageRepository.getStorageQuota(input.userId);
      if (!quota) {
        throw new Error('用户存储额度不存在。');
      }

      if (cachedMedia && !cachedMedia.expired) {
        if (quota.storageUsedBytes + cachedMedia.byteSize > quota.storageQuotaBytes) {
          await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
            saveStatus: 'save_failed',
            saveError: 'storage_quota_exceeded',
          });
          throw new Error('存储空间不足，无法保存到我的媒体。');
        }

        await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
          saveStatus: 'saving',
        });

        try {
          if (!dependencies.promoteCachedObject) {
            throw new Error('缓存媒体晋升服务不可用。');
          }

          const assetId = randomUUID();
          const objectKey =
            dependencies.createObjectKey?.({
              userId: input.userId,
              conversationId: run.conversationId,
              runId: run.id,
              assetId,
              mimeType: cachedMedia.mimeType,
            }) ??
            inferObjectKey({
              userId: input.userId,
              conversationId: run.conversationId,
              runId: run.id,
              assetId,
              mimeType: cachedMedia.mimeType,
            });

          const uploaded = await dependencies.promoteCachedObject({
            sourceObjectKey: cachedMedia.objectKey,
            targetObjectKey: objectKey,
            contentType: cachedMedia.mimeType,
          });

          const savedAsset = await dependencies.mediaAssetRepository.createSavedAsset({
            userId: input.userId,
            runId: run.id,
            conversationId: run.conversationId,
            artifactId: artifact.id,
            kind: artifact.kind === 'video' ? 'video' : 'image',
            title: artifact.title,
            sourceType: 'ai_generated',
            sourceProvider: run.capabilitySummary.provider,
            sourceModel: run.capabilitySummary.model,
            sourceUrl,
            sourceExpiresAt: readString(metadata, 'providerExpiresAt'),
            originalFilename: null,
            sha256: null,
            shareId: null,
            shareStatus: 'disabled',
            sharedAt: null,
            storageProvider: 'tencent_cos',
            bucket: uploaded.bucket,
            region: uploaded.region,
            objectKey: uploaded.objectKey,
            mimeType: cachedMedia.mimeType,
            byteSize: cachedMedia.byteSize,
            width: cachedMedia.width,
            height: cachedMedia.height,
            durationSeconds: cachedMedia.durationSeconds,
            metadata: {},
          });

          await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
            saveStatus: 'saved',
            savedAssetId: savedAsset.id,
          });
          await dependencies.userStorageRepository.incrementStorageUsedBytes(
            input.userId,
            cachedMedia.byteSize,
          );

          const updatedDetail = await dependencies.runRepository.getRunDetailForUser(input.runId, input.userId);
          const updatedArtifact = readSaveEligibleArtifact(
            updatedDetail?.run.artifacts ?? [],
            input.artifactId,
          );
          if (!updatedArtifact) {
            throw new Error('保存后无法读取生成结果。');
          }

          return {
            asset: savedAsset,
            updatedArtifact,
          };
        } catch (error) {
          await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
            saveStatus: 'save_failed',
            saveError: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      if (!sourceUrl) {
        await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
          saveStatus: 'source_expired',
        });
        throw new Error('源文件已失效，无法保存到我的媒体。');
      }

      await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
        saveStatus: 'saving',
      });

      try {
        const downloaded = await dependencies.fetchSource(sourceUrl);
        if (quota.storageUsedBytes + downloaded.byteSize > quota.storageQuotaBytes) {
          await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
            saveStatus: 'save_failed',
            saveError: 'storage_quota_exceeded',
          });
          throw new Error('存储空间不足，无法保存到我的媒体。');
        }

        const assetId = randomUUID();
        const objectKey =
          dependencies.createObjectKey?.({
            userId: input.userId,
            conversationId: run.conversationId,
            runId: run.id,
            assetId,
            mimeType: downloaded.mimeType,
          }) ??
          inferObjectKey({
            userId: input.userId,
            conversationId: run.conversationId,
            runId: run.id,
            assetId,
            mimeType: downloaded.mimeType,
          });

        const uploaded = await dependencies.cosClient.uploadObject({
          objectKey,
          body: downloaded.bytes,
          contentType: downloaded.mimeType,
        });

        const savedAsset = await dependencies.mediaAssetRepository.createSavedAsset({
          userId: input.userId,
          runId: run.id,
          conversationId: run.conversationId,
          artifactId: artifact.id,
          kind: artifact.kind === 'video' ? 'video' : 'image',
          title: artifact.title,
          sourceType: 'ai_generated',
          sourceProvider: run.capabilitySummary.provider,
          sourceModel: run.capabilitySummary.model,
          sourceUrl,
          sourceExpiresAt: readString(metadata, 'providerExpiresAt'),
          originalFilename: null,
          sha256: null,
          shareId: null,
          shareStatus: 'disabled',
          sharedAt: null,
          storageProvider: 'tencent_cos',
          bucket: uploaded.bucket,
          region: uploaded.region,
          objectKey: uploaded.objectKey,
          mimeType: downloaded.mimeType,
          byteSize: downloaded.byteSize,
          width: downloaded.width ?? readNumber(metadata, 'width'),
          height: downloaded.height ?? readNumber(metadata, 'height'),
          durationSeconds: downloaded.durationSeconds ?? readNumber(metadata, 'durationSeconds'),
          metadata: {},
        });

        await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
          saveStatus: 'saved',
          savedAssetId: savedAsset.id,
        });
        await dependencies.userStorageRepository.incrementStorageUsedBytes(
          input.userId,
          downloaded.byteSize,
        );

        const updatedDetail = await dependencies.runRepository.getRunDetailForUser(input.runId, input.userId);
        const updatedArtifact = readSaveEligibleArtifact(
          updatedDetail?.run.artifacts ?? [],
          input.artifactId,
        );
        if (!updatedArtifact) {
          throw new Error('保存后无法读取生成结果。');
        }

        return {
          asset: savedAsset,
          updatedArtifact,
        };
      } catch (error) {
        await dependencies.runRepository.updateArtifactSaveState(input.runId, input.artifactId, {
          saveStatus: 'save_failed',
          saveError: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
