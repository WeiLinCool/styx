import path from 'node:path';

import { createTencentCosClient, type TencentCosClient } from './cos-client';

export type DownloadedGeneratedMedia = {
  bytes: Uint8Array;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

type CacheUploadResult = {
  bucket: string;
  region: string;
  objectKey: string;
};

export type CachedGeneratedMedia = {
  storageProvider: 'tencent_cos';
  bucket: string;
  region: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  expiresAt: string;
  metadata: Record<string, unknown>;
};

export type CacheGeneratedMediaInput = {
  userId: string;
  runId: string;
  artifactId: string;
  kind: 'image' | 'video';
  title: string;
  sourceUrl?: string;
  dataUrl?: string;
  mimeType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
};

export type GeneratedMediaCacheDependencies = {
  cosClient: Pick<TencentCosClient, 'createSignedReadUrl'> & {
    uploadObject(input: {
      objectKey: string;
      body: Uint8Array;
      contentType: string;
    }): Promise<CacheUploadResult>;
  };
  fetchSource(url: string): Promise<DownloadedGeneratedMedia>;
  now?: () => Date;
  retentionMs?: number;
  environmentName?: string;
};

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_ACCESS_SECONDS = 600;
const SUPPORTED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
]);

function now(dependencies: GeneratedMediaCacheDependencies) {
  return dependencies.now?.() ?? new Date();
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'video/mp4') return '.mp4';
  return '';
}

function assertSupportedMediaType(mimeType: string) {
  if (!SUPPORTED_MEDIA_TYPES.has(mimeType)) {
    throw new Error('unsupported generated media type.');
  }
}

function createCacheObjectKey(input: {
  userId: string;
  runId: string;
  artifactId: string;
  mimeType: string;
  environmentName: string;
}) {
  return path.posix.join(
    'ai-generated-cache',
    input.environmentName,
    'users',
    input.userId,
    'runs',
    input.runId,
    `${input.artifactId}${extensionFromMimeType(input.mimeType)}`,
  );
}

function requireSourceUrl(sourceUrl: string | undefined) {
  if (!sourceUrl) {
    throw new Error('generated media cache requires sourceUrl or dataUrl.');
  }
  return sourceUrl;
}

function decodeDataUrl(dataUrl: string): DownloadedGeneratedMedia {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new Error('generated media data URL is invalid.');
  }

  const mimeType = match[1];
  assertSupportedMediaType(mimeType);
  const bytes = Buffer.from(match[2], 'base64');

  return {
    bytes,
    mimeType,
    byteSize: bytes.byteLength,
    width: null,
    height: null,
    durationSeconds: null,
  };
}

async function fetchGeneratedMediaSource(url: string): Promise<DownloadedGeneratedMedia> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('generated media source download failed.');
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  assertSupportedMediaType(mimeType);
  const bytes = new Uint8Array(await response.arrayBuffer());

  return {
    bytes,
    mimeType,
    byteSize: bytes.byteLength,
    width: null,
    height: null,
    durationSeconds: null,
  };
}

export function createGeneratedMediaCacheService(dependencies: GeneratedMediaCacheDependencies) {
  return {
    async cacheGeneratedMedia(input: CacheGeneratedMediaInput): Promise<CachedGeneratedMedia> {
      const downloaded = input.dataUrl
        ? decodeDataUrl(input.dataUrl)
        : await dependencies.fetchSource(requireSourceUrl(input.sourceUrl));

      assertSupportedMediaType(downloaded.mimeType);

      const environmentName =
        dependencies.environmentName ?? process.env.NODE_ENV ?? 'development';
      const objectKey = createCacheObjectKey({
        userId: input.userId,
        runId: input.runId,
        artifactId: input.artifactId,
        mimeType: downloaded.mimeType,
        environmentName,
      });

      const uploaded = await dependencies.cosClient.uploadObject({
        objectKey,
        body: downloaded.bytes,
        contentType: downloaded.mimeType,
      });

      return {
        storageProvider: 'tencent_cos',
        bucket: uploaded.bucket,
        region: uploaded.region,
        objectKey: uploaded.objectKey,
        mimeType: downloaded.mimeType,
        byteSize: downloaded.byteSize,
        width: downloaded.width,
        height: downloaded.height,
        durationSeconds: downloaded.durationSeconds,
        expiresAt: new Date(
          now(dependencies).getTime() + (dependencies.retentionMs ?? DEFAULT_RETENTION_MS),
        ).toISOString(),
        metadata: structuredClone(input.metadata ?? {}),
      };
    },
    async createPreviewAccess(input: {
      objectKey: string;
      expiresInSeconds?: number;
    }): Promise<{ url: string; expiresAt: string }> {
      const expiresInSeconds = input.expiresInSeconds ?? PREVIEW_ACCESS_SECONDS;
      return {
        url: await dependencies.cosClient.createSignedReadUrl(input.objectKey, expiresInSeconds),
        expiresAt: new Date(now(dependencies).getTime() + expiresInSeconds * 1000).toISOString(),
      };
    },
  };
}

export function createDefaultGeneratedMediaCacheService() {
  return createGeneratedMediaCacheService({
    cosClient: createTencentCosClient(),
    fetchSource: fetchGeneratedMediaSource,
  });
}
