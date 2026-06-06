import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import type { TencentCosClient } from './cos-client';
import type { GeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import type { UserStorageRepository } from '@/server/repositories/users';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-wav']);
const VIDEO_TYPES = new Set(['video/mp4']);

function inferKind(mimeType: string) {
  if (IMAGE_TYPES.has(mimeType)) {
    return 'image' as const;
  }
  if (AUDIO_TYPES.has(mimeType)) {
    return 'audio' as const;
  }
  if (VIDEO_TYPES.has(mimeType)) {
    return 'video' as const;
  }

  throw new Error('仅支持上传图片、音频或视频文件。');
}

function defaultExtensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case 'audio/mpeg':
      return '.mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return '.wav';
    case 'audio/mp4':
      return '.m4a';
    case 'video/mp4':
      return '.mp4';
    default:
      return '.png';
  }
}

function defaultObjectKey(input: {
  userId: string;
  assetId: string;
  filename: string;
  mimeType: string;
}) {
  const ext = path.extname(input.filename);
  const suffix = ext || defaultExtensionForMimeType(input.mimeType);
  return `user-uploaded/${process.env.NODE_ENV ?? 'development'}/users/${input.userId}/assets/${input.assetId}/${input.assetId}${suffix}`;
}

function normalizeTitle(title: string, filename: string) {
  const trimmed = title.trim();
  if (trimmed) {
    return trimmed;
  }

  const parsed = path.parse(filename).name.trim();
  return parsed || '未命名资料';
}

export function createUploadUserMediaService(dependencies: {
  mediaAssetRepository: GeneratedMediaAssetRepository;
  userStorageRepository: UserStorageRepository;
  cosClient: Pick<TencentCosClient, 'uploadObject' | 'deleteObject'>;
  createObjectKey?: (input: {
    userId: string;
    assetId: string;
    filename: string;
    mimeType: string;
  }) => string;
  computeSha256?: (bytes: Uint8Array) => Promise<string>;
}) {
  return {
    async uploadForUser(input: {
      userId: string;
      title: string;
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
    }) {
      const kind = inferKind(input.mimeType);
      const quota = await dependencies.userStorageRepository.getStorageQuota(input.userId);
      if (!quota) {
        throw new Error('用户存储额度不存在。');
      }
      if (quota.storageUsedBytes + input.bytes.byteLength > quota.storageQuotaBytes) {
        throw new Error('存储空间不足，无法上传到我的媒体。');
      }

      const assetId = randomUUID();
      const objectKey =
        dependencies.createObjectKey?.({
          userId: input.userId,
          assetId,
          filename: input.filename,
          mimeType: input.mimeType,
        }) ?? defaultObjectKey({ ...input, assetId });
      const sha256 =
        (await dependencies.computeSha256?.(input.bytes)) ??
        createHash('sha256').update(input.bytes).digest('hex');

      const uploaded = await dependencies.cosClient.uploadObject({
        objectKey,
        body: input.bytes,
        contentType: input.mimeType,
      });

      try {
        const asset = await dependencies.mediaAssetRepository.createSavedAsset({
          userId: input.userId,
          runId: null,
          conversationId: null,
          artifactId: null,
          kind,
          title: normalizeTitle(input.title, input.filename),
          sourceType: 'user_uploaded',
          sourceProvider: null,
          sourceModel: null,
          sourceUrl: null,
          sourceExpiresAt: null,
          originalFilename: input.filename,
          sha256,
          shareId: null,
          shareStatus: 'disabled',
          sharedAt: null,
          storageProvider: 'tencent_cos',
          bucket: uploaded.bucket,
          region: uploaded.region,
          objectKey: uploaded.objectKey,
          mimeType: input.mimeType,
          byteSize: input.bytes.byteLength,
          width: null,
          height: null,
          durationSeconds: null,
          metadata: {},
        });

        await dependencies.userStorageRepository.incrementStorageUsedBytes(
          input.userId,
          input.bytes.byteLength,
        );

        return { asset };
      } catch (error) {
        await dependencies.cosClient.deleteObject(uploaded.objectKey);
        throw error;
      }
    },
  };
}
