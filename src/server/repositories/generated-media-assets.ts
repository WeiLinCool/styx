import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { GeneratedMediaAssetDto } from '@/server/agent/types';
import { db, schema } from '@/server/db';

export type CreateSavedAssetInput = {
  userId: string;
  runId: string | null;
  conversationId: string | null;
  artifactId: string | null;
  kind: GeneratedMediaAssetDto['kind'];
  title: string;
  sourceType: GeneratedMediaAssetDto['sourceType'];
  sourceProvider: string | null;
  sourceModel: string | null;
  sourceUrl?: string | null;
  sourceExpiresAt?: string | null;
  originalFilename?: string | null;
  sha256?: string | null;
  shareId?: string | null;
  shareStatus?: GeneratedMediaAssetDto['shareStatus'];
  sharedAt?: string | null;
  storageProvider: string;
  bucket: string;
  region: string;
  objectKey: string;
  mimeType?: string | null;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown>;
};

export type GeneratedMediaAssetRepository = {
  createSavedAsset(input: CreateSavedAssetInput): Promise<GeneratedMediaAssetDto>;
  listSavedAssetsForUser(userId: string): Promise<GeneratedMediaAssetDto[]>;
  findSavedAssetBySource(input: {
    userId: string;
    runId: string;
    artifactId: string;
  }): Promise<GeneratedMediaAssetDto | null>;
  findAssetForUser(input: {
    userId: string;
    assetId: string;
  }): Promise<GeneratedMediaAssetDto | null>;
  getSavedAssetForUser(assetId: string, userId: string): Promise<GeneratedMediaAssetDto | null>;
  enableSharingForUser(
    assetId: string,
    userId: string,
    input: { shareId: string; sharedAt: string },
  ): Promise<GeneratedMediaAssetDto | null>;
  disableSharingForUser(assetId: string, userId: string): Promise<GeneratedMediaAssetDto | null>;
  getActiveSharedAssetByShareId(shareId: string): Promise<GeneratedMediaAssetDto | null>;
  getSavedAssetForAdmin(assetId: string): Promise<GeneratedMediaAssetDto | null>;
  softDeleteSavedAssetForUser(assetId: string, userId: string): Promise<GeneratedMediaAssetDto | null>;
};

type StoredGeneratedMediaAsset = GeneratedMediaAssetDto;

function cloneRecord(record: Record<string, unknown>) {
  return structuredClone(record);
}

function toIso(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toGeneratedMediaAssetDto(
  asset: typeof schema.generatedMediaAssets.$inferSelect,
): GeneratedMediaAssetDto {
  return {
    id: asset.id,
    userId: asset.userId,
    runId: asset.runId,
    conversationId: asset.conversationId,
    artifactId: asset.artifactId,
    kind: asset.kind as GeneratedMediaAssetDto['kind'],
    title: asset.title,
    sourceType: asset.sourceType,
    sourceProvider: asset.sourceProvider,
    sourceModel: asset.sourceModel,
    sourceUrl: asset.sourceUrl,
    sourceExpiresAt: toIso(asset.sourceExpiresAt),
    originalFilename: asset.originalFilename,
    sha256: asset.sha256,
    shareId: asset.shareId,
    shareStatus: asset.shareStatus,
    sharedAt: toIso(asset.sharedAt),
    storageProvider: asset.storageProvider,
    bucket: asset.bucket,
    region: asset.region,
    objectKey: asset.objectKey,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    status: asset.status,
    metadata: cloneRecord((asset.metadata ?? {}) as Record<string, unknown>),
    saveRequestedAt: toIso(asset.saveRequestedAt) ?? new Date().toISOString(),
    savedAt: toIso(asset.savedAt) ?? new Date().toISOString(),
    deletedAt: toIso(asset.deletedAt),
    createdAt: toIso(asset.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(asset.updatedAt) ?? new Date().toISOString(),
  };
}

function createStoredAsset(input: CreateSavedAssetInput): StoredGeneratedMediaAsset {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    userId: input.userId,
    runId: input.runId,
    conversationId: input.conversationId,
    artifactId: input.artifactId,
    kind: input.kind,
    title: input.title,
    sourceType: input.sourceType,
    sourceProvider: input.sourceProvider,
    sourceModel: input.sourceModel,
    sourceUrl: input.sourceUrl ?? null,
    sourceExpiresAt: input.sourceExpiresAt ?? null,
    originalFilename: input.originalFilename ?? null,
    sha256: input.sha256 ?? null,
    shareId: input.shareId ?? null,
    shareStatus: input.shareStatus ?? 'disabled',
    sharedAt: input.sharedAt ?? null,
    storageProvider: input.storageProvider,
    bucket: input.bucket,
    region: input.region,
    objectKey: input.objectKey,
    mimeType: input.mimeType ?? null,
    byteSize: input.byteSize,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds: input.durationSeconds ?? null,
    status: 'ready',
    metadata: cloneRecord(input.metadata ?? {}),
    saveRequestedAt: timestamp,
    savedAt: timestamp,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDatabaseGeneratedMediaAssetRepository(): GeneratedMediaAssetRepository {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database-backed generated media asset repository.');
  }
  const database = db;

  return {
    async createSavedAsset(input) {
      const [asset] = await database
        .insert(schema.generatedMediaAssets)
        .values({
          userId: input.userId,
          runId: input.runId,
          conversationId: input.conversationId,
          artifactId: input.artifactId,
          kind: input.kind,
          title: input.title,
          sourceType: input.sourceType,
          sourceProvider: input.sourceProvider,
          sourceModel: input.sourceModel,
          sourceUrl: input.sourceUrl ?? null,
          sourceExpiresAt: input.sourceExpiresAt ? new Date(input.sourceExpiresAt) : null,
          originalFilename: input.originalFilename ?? null,
          sha256: input.sha256 ?? null,
          shareId: input.shareId ?? null,
          shareStatus: input.shareStatus ?? 'disabled',
          sharedAt: input.sharedAt ? new Date(input.sharedAt) : null,
          storageProvider: input.storageProvider,
          bucket: input.bucket,
          region: input.region,
          objectKey: input.objectKey,
          mimeType: input.mimeType ?? null,
          byteSize: input.byteSize,
          width: input.width ?? null,
          height: input.height ?? null,
          durationSeconds: input.durationSeconds ?? null,
          metadata: input.metadata ?? {},
        })
        .returning();

      return toGeneratedMediaAssetDto(asset);
    },
    async listSavedAssetsForUser(userId) {
      const assets = await database
        .select()
        .from(schema.generatedMediaAssets)
        .where(
          and(
            eq(schema.generatedMediaAssets.userId, userId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .orderBy(desc(schema.generatedMediaAssets.savedAt), desc(schema.generatedMediaAssets.createdAt));

      return assets.map(toGeneratedMediaAssetDto);
    },
    async findSavedAssetBySource(input) {
      const [asset] = await database
        .select()
        .from(schema.generatedMediaAssets)
        .where(
          and(
            eq(schema.generatedMediaAssets.userId, input.userId),
            eq(schema.generatedMediaAssets.runId, input.runId),
            eq(schema.generatedMediaAssets.artifactId, input.artifactId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .limit(1);

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
    async getSavedAssetForUser(assetId, userId) {
      const [asset] = await database
        .select()
        .from(schema.generatedMediaAssets)
        .where(
          and(
            eq(schema.generatedMediaAssets.id, assetId),
            eq(schema.generatedMediaAssets.userId, userId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .limit(1);

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
    async findAssetForUser(input) {
      return this.getSavedAssetForUser(input.assetId, input.userId);
    },
    async enableSharingForUser(assetId, userId, input) {
      const [asset] = await database
        .update(schema.generatedMediaAssets)
        .set({
          shareId: input.shareId,
          shareStatus: 'active',
          sharedAt: new Date(input.sharedAt),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.generatedMediaAssets.id, assetId),
            eq(schema.generatedMediaAssets.userId, userId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .returning();

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
    async disableSharingForUser(assetId, userId) {
      const [asset] = await database
        .update(schema.generatedMediaAssets)
        .set({
          shareStatus: 'disabled',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.generatedMediaAssets.id, assetId),
            eq(schema.generatedMediaAssets.userId, userId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .returning();

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
    async getActiveSharedAssetByShareId(shareId) {
      const [asset] = await database
        .select()
        .from(schema.generatedMediaAssets)
        .where(
          and(
            eq(schema.generatedMediaAssets.shareId, shareId),
            eq(schema.generatedMediaAssets.shareStatus, 'active'),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .limit(1);

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
    async getSavedAssetForAdmin(assetId) {
      const [asset] = await database
        .select()
        .from(schema.generatedMediaAssets)
        .where(
          and(
            eq(schema.generatedMediaAssets.id, assetId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .limit(1);

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
    async softDeleteSavedAssetForUser(assetId, userId) {
      const [asset] = await database
        .update(schema.generatedMediaAssets)
        .set({
          status: 'deleted',
          shareStatus: 'disabled',
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.generatedMediaAssets.id, assetId),
            eq(schema.generatedMediaAssets.userId, userId),
            eq(schema.generatedMediaAssets.status, 'ready'),
            isNull(schema.generatedMediaAssets.deletedAt),
          ),
        )
        .returning();

      return asset ? toGeneratedMediaAssetDto(asset) : null;
    },
  };
}

export function createMemoryGeneratedMediaAssetRepository(): GeneratedMediaAssetRepository {
  const assets = new Map<string, StoredGeneratedMediaAsset>();

  return {
    async createSavedAsset(input) {
      const asset = createStoredAsset(input);
      assets.set(asset.id, asset);
      return structuredClone(asset);
    },
    async listSavedAssetsForUser(userId) {
      return Array.from(assets.values())
        .filter((asset) => asset.userId === userId && asset.status === 'ready' && !asset.deletedAt)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.createdAt.localeCompare(a.createdAt))
        .map((asset) => structuredClone(asset));
    },
    async findSavedAssetBySource(input) {
      const asset =
        Array.from(assets.values()).find(
          (item) =>
            item.userId === input.userId &&
            item.runId === input.runId &&
            item.artifactId === input.artifactId &&
            item.status === 'ready' &&
            !item.deletedAt,
        ) ?? null;

      return asset ? structuredClone(asset) : null;
    },
    async getSavedAssetForUser(assetId, userId) {
      const asset = assets.get(assetId);
      if (!asset || asset.userId !== userId || asset.status !== 'ready' || asset.deletedAt) {
        return null;
      }

      return structuredClone(asset);
    },
    async findAssetForUser(input) {
      return this.getSavedAssetForUser(input.assetId, input.userId);
    },
    async enableSharingForUser(assetId, userId, input) {
      const asset = assets.get(assetId);
      if (!asset || asset.userId !== userId || asset.status !== 'ready' || asset.deletedAt) {
        return null;
      }

      asset.shareId = input.shareId;
      asset.shareStatus = 'active';
      asset.sharedAt = input.sharedAt;
      asset.updatedAt = input.sharedAt;
      return structuredClone(asset);
    },
    async disableSharingForUser(assetId, userId) {
      const asset = assets.get(assetId);
      if (!asset || asset.userId !== userId || asset.status !== 'ready' || asset.deletedAt) {
        return null;
      }

      asset.shareStatus = 'disabled';
      asset.updatedAt = new Date().toISOString();
      return structuredClone(asset);
    },
    async getActiveSharedAssetByShareId(shareId) {
      const asset =
        Array.from(assets.values()).find(
          (item) =>
            item.shareId === shareId &&
            item.shareStatus === 'active' &&
            item.status === 'ready' &&
            !item.deletedAt,
        ) ?? null;

      return asset ? structuredClone(asset) : null;
    },
    async getSavedAssetForAdmin(assetId) {
      const asset = assets.get(assetId);
      if (!asset || asset.status !== 'ready' || asset.deletedAt) {
        return null;
      }

      return structuredClone(asset);
    },
    async softDeleteSavedAssetForUser(assetId, userId) {
      const asset = assets.get(assetId);
      if (!asset || asset.userId !== userId || asset.status !== 'ready' || asset.deletedAt) {
        return null;
      }

      asset.status = 'deleted';
      asset.shareStatus = 'disabled';
      asset.deletedAt = new Date().toISOString();
      asset.updatedAt = asset.deletedAt;
      return structuredClone(asset);
    },
  };
}

const globalDevelopmentGeneratedMediaAssetRepository = globalThis as typeof globalThis & {
  __styxGeneratedMediaAssetRepository?: GeneratedMediaAssetRepository;
};

export function getGeneratedMediaAssetRepository(): GeneratedMediaAssetRepository {
  if (process.env.DATABASE_URL) {
    return createDatabaseGeneratedMediaAssetRepository();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for generated media asset repository in production.');
  }

  globalDevelopmentGeneratedMediaAssetRepository.__styxGeneratedMediaAssetRepository ??=
    createMemoryGeneratedMediaAssetRepository();

  return globalDevelopmentGeneratedMediaAssetRepository.__styxGeneratedMediaAssetRepository;
}
