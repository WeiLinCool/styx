import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { createMemoryAgentRunRepository } from '@/server/repositories/agent-runs';
import { createMemoryUserStorageRepository } from '@/server/repositories/users';
import { createSaveGeneratedMediaService } from './save-generated-media';

async function createRunWithSavableArtifact() {
  const runRepository = createMemoryAgentRunRepository();
  const run = await runRepository.createRun({
    userId: 'user-1',
    conversationId: '11111111-1111-4111-8111-111111111111',
    taskType: 'image',
    prompt: '海报',
    provider: 'doubao',
    model: 'seedream-3',
    capabilitySnapshot: {
      bundleId: 'bundle-image',
      bundleCode: 'image-default',
      provider: 'doubao',
      model: 'seedream-3',
      capabilities: [],
    },
    input: {},
  });

  const completed = await runRepository.completeRun(run.id, {
    finalMessage: '完成',
    artifacts: [
      {
        kind: 'image',
        title: '生成图片',
        metadata: {
          saveStatus: 'not_saved',
          providerExpiresAt: '2026-06-03T12:00:00.000Z',
          sourceUrl: 'https://provider.example/output.png',
          mimeType: 'image/png',
          width: 512,
          height: 512,
        },
      },
    ],
  });

  const artifactId = completed?.artifacts[0]?.id;
  assert.ok(artifactId);

  return { runRepository, runId: run.id, artifactId };
}

async function createRunWithCachedArtifact(overrides: Record<string, unknown> = {}) {
  const runRepository = createMemoryAgentRunRepository();
  const run = await runRepository.createRun({
    userId: 'user-1',
    conversationId: '11111111-1111-4111-8111-111111111111',
    taskType: 'image',
    prompt: '海报',
    provider: 'doubao',
    model: 'seedream-3',
    capabilitySnapshot: {
      bundleId: 'bundle-image',
      bundleCode: 'image-default',
      provider: 'doubao',
      model: 'seedream-3',
      capabilities: [],
    },
    input: {},
  });

  const completed = await runRepository.completeRun(run.id, {
    finalMessage: '完成',
    artifacts: [
      {
        kind: 'image',
        title: '生成图片',
        metadata: {
          saveStatus: 'not_saved',
          storageStatus: 'cached',
          cacheStatus: 'available',
          cacheObjectKey: 'ai-generated-cache/test/users/user-1/runs/run-1/artifact-1.png',
          cacheExpiresAt: '2026-06-13T00:00:00.000Z',
          sourceUrl: 'https://provider.example/output.png',
          providerExpiresAt: '2026-06-07T00:00:00.000Z',
          mimeType: 'image/png',
          byteLength: 4,
          width: 512,
          height: 512,
          ...overrides,
        },
      },
    ],
  });

  const artifactId = completed?.artifacts[0]?.id;
  assert.ok(artifactId);

  return { runRepository, runId: run.id, artifactId };
}

test('save generated media uploads to COS, creates asset, and marks artifact saved', async () => {
  const { runRepository, runId, artifactId } = await createRunWithSavableArtifact();
  const mediaAssetRepository = createMemoryGeneratedMediaAssetRepository();
  const userStorageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });

  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository,
    userStorageRepository,
    cosClient: {
      async uploadObject(input) {
        assert.equal(input.contentType, 'image/png');
        return {
          bucket: 'bucket-a',
          region: 'ap-shanghai',
          objectKey:
            'ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/' +
            `${runId}/asset-1.png`,
        };
      },
      async deleteObject() {},
    },
    fetchSource: async () => ({
      bytes: Buffer.from('png'),
      mimeType: 'image/png',
      byteSize: 3,
      width: 1,
      height: 1,
      durationSeconds: null,
    }),
    createObjectKey: () =>
      `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
  });

  const result = await service.saveForUser({
    userId: 'user-1',
    runId,
    artifactId,
  });

  assert.equal(result.asset.kind, 'image');
  assert.equal(result.asset.sourceType, 'ai_generated');
  assert.equal(result.asset.originalFilename, null);
  assert.equal(result.asset.shareStatus, 'disabled');
  assert.equal(result.asset.shareId, null);
  assert.equal(result.asset.storageProvider, 'tencent_cos');
  assert.equal(result.updatedArtifact.metadata.saveStatus, 'saved');
  assert.equal(result.updatedArtifact.metadata.savedAssetId, result.asset.id);

  const quota = await userStorageRepository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 10_000, storageUsedBytes: 3 });
});

test('save generated media promotes cached artifact without fetching provider source', async () => {
  const { runRepository, runId, artifactId } = await createRunWithCachedArtifact();
  const mediaAssetRepository = createMemoryGeneratedMediaAssetRepository();
  const userStorageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });
  const promotions: Array<{ sourceObjectKey: string; targetObjectKey: string; contentType: string }> = [];

  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository,
    userStorageRepository,
    cosClient: {
      async uploadObject() {
        throw new Error('provider upload should not be called');
      },
      async deleteObject() {},
    },
    promoteCachedObject: async (input) => {
      promotions.push(input);
      return {
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: input.targetObjectKey,
      };
    },
    fetchSource: async () => {
      throw new Error('provider fetch should not be called');
    },
    createObjectKey: () =>
      `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });

  const result = await service.saveForUser({ userId: 'user-1', runId, artifactId });

  assert.equal(result.asset.mimeType, 'image/png');
  assert.equal(result.asset.byteSize, 4);
  assert.equal(result.asset.width, 512);
  assert.equal(result.asset.sourceUrl, 'https://provider.example/output.png');
  assert.equal(result.updatedArtifact.metadata.saveStatus, 'saved');
  assert.deepEqual(promotions, [
    {
      sourceObjectKey: 'ai-generated-cache/test/users/user-1/runs/run-1/artifact-1.png',
      targetObjectKey: `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
      contentType: 'image/png',
    },
  ]);
  const quota = await userStorageRepository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 10_000, storageUsedBytes: 4 });
});

test('save generated media falls back to provider source when cached object is missing', async () => {
  const { runRepository, runId, artifactId } = await createRunWithCachedArtifact();
  const mediaAssetRepository = createMemoryGeneratedMediaAssetRepository();
  const userStorageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });
  let fetched = 0;
  let uploaded = 0;

  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository,
    userStorageRepository,
    cosClient: {
      async uploadObject(input) {
        uploaded += 1;
        assert.equal(input.contentType, 'image/png');
        return {
          bucket: 'bucket-a',
          region: 'ap-shanghai',
          objectKey: input.objectKey,
        };
      },
      async deleteObject() {},
    },
    promoteCachedObject: async () => {
      throw Object.assign(new Error('Failed to query the state of source object'), {
        Code: 'NoSuchKey',
      });
    },
    fetchSource: async () => {
      fetched += 1;
      return {
        bytes: Buffer.from('png'),
        mimeType: 'image/png',
        byteSize: 3,
        width: 1,
        height: 1,
        durationSeconds: null,
      };
    },
    createObjectKey: () =>
      `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
  });

  const result = await service.saveForUser({ userId: 'user-1', runId, artifactId });

  assert.equal(result.asset.mimeType, 'image/png');
  assert.equal(result.asset.byteSize, 3);
  assert.equal(result.updatedArtifact.metadata.saveStatus, 'saved');
  assert.equal(fetched, 1);
  assert.equal(uploaded, 1);
  const quota = await userStorageRepository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 10_000, storageUsedBytes: 3 });
});

test('save generated media reports cache-missing fallback failure explicitly', async () => {
  const { runRepository, runId, artifactId } = await createRunWithCachedArtifact();
  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    userStorageRepository: createMemoryUserStorageRepository({
      'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
    }),
    cosClient: {
      async uploadObject() {
        throw new Error('provider upload should not be called');
      },
      async deleteObject() {},
    },
    promoteCachedObject: async () => {
      throw Object.assign(new Error('Failed to query the state of source object'), {
        Code: 'NoSuchKey',
      });
    },
    fetchSource: async () => {
      throw new Error('generated media source download failed.');
    },
    createObjectKey: () =>
      `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
  });

  await assert.rejects(
    () => service.saveForUser({ userId: 'user-1', runId, artifactId }),
    /缓存对象缺失，已回退/,
  );

  const detail = await runRepository.getRunDetailForUser(runId, 'user-1');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveStatus, 'save_failed');
  assert.equal(
    detail?.run.artifacts[0]?.metadata.saveError,
    'cache_missing_fallback_failed: generated media source download failed.',
  );
});

test('save generated media marks cached artifact source_expired when cache expired without fallback', async () => {
  const { runRepository, runId, artifactId } = await createRunWithCachedArtifact({
    cacheExpiresAt: '2026-06-05T00:00:00.000Z',
    sourceUrl: null,
  });
  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    userStorageRepository: createMemoryUserStorageRepository({
      'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
    }),
    cosClient: {
      async uploadObject() {
        throw new Error('upload should not be called');
      },
      async deleteObject() {},
    },
    promoteCachedObject: async () => {
      throw new Error('promotion should not be called');
    },
    fetchSource: async () => {
      throw new Error('fetch should not be called');
    },
    createObjectKey: () => 'unused',
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });

  await assert.rejects(
    () => service.saveForUser({ userId: 'user-1', runId, artifactId }),
    /源文件已失效/,
  );

  const detail = await runRepository.getRunDetailForUser(runId, 'user-1');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveStatus, 'source_expired');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveError, 'cache_expired');
});

test('save generated media checks quota before promoting cached artifact', async () => {
  const { runRepository, runId, artifactId } = await createRunWithCachedArtifact({
    byteLength: 11_000,
  });
  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    userStorageRepository: createMemoryUserStorageRepository({
      'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
    }),
    cosClient: {
      async uploadObject() {
        throw new Error('upload should not be called');
      },
      async deleteObject() {},
    },
    promoteCachedObject: async () => {
      throw new Error('promotion should not be called');
    },
    fetchSource: async () => {
      throw new Error('fetch should not be called');
    },
    createObjectKey: () => 'unused',
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });

  await assert.rejects(
    () => service.saveForUser({ userId: 'user-1', runId, artifactId }),
    /存储空间不足/,
  );

  const detail = await runRepository.getRunDetailForUser(runId, 'user-1');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveStatus, 'save_failed');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveError, 'storage_quota_exceeded');
});

test('save generated media returns existing asset for duplicate save requests', async () => {
  const { runRepository, runId, artifactId } = await createRunWithSavableArtifact();
  const mediaAssetRepository = createMemoryGeneratedMediaAssetRepository();
  const userStorageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });

  let uploads = 0;
  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository,
    userStorageRepository,
    cosClient: {
      async uploadObject() {
        uploads += 1;
        return {
          bucket: 'bucket-a',
          region: 'ap-shanghai',
          objectKey: `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
        };
      },
      async deleteObject() {},
    },
    fetchSource: async () => ({
      bytes: Buffer.from('png'),
      mimeType: 'image/png',
      byteSize: 3,
      width: 1,
      height: 1,
      durationSeconds: null,
    }),
    createObjectKey: () =>
      `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
  });

  const first = await service.saveForUser({ userId: 'user-1', runId, artifactId });
  const second = await service.saveForUser({ userId: 'user-1', runId, artifactId });

  assert.equal(second.asset.id, first.asset.id);
  assert.equal(uploads, 1);
});

test('save generated media rejects cross-user artifact saves', async () => {
  const { runRepository, runId, artifactId } = await createRunWithSavableArtifact();
  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    userStorageRepository: createMemoryUserStorageRepository({
      'user-2': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
    }),
    cosClient: {
      async uploadObject() {
        throw new Error('upload should not be called');
      },
      async deleteObject() {},
    },
    fetchSource: async () => {
      throw new Error('fetch should not be called');
    },
    createObjectKey: () => 'unused',
  });

  await assert.rejects(
    () => service.saveForUser({ userId: 'user-2', runId, artifactId }),
    /生成记录不存在/,
  );
});

test('save generated media marks artifact save_failed when upload fails', async () => {
  const { runRepository, runId, artifactId } = await createRunWithSavableArtifact();
  const service = createSaveGeneratedMediaService({
    runRepository,
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    userStorageRepository: createMemoryUserStorageRepository({
      'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
    }),
    cosClient: {
      async uploadObject() {
        throw new Error('upload failed');
      },
      async deleteObject() {},
    },
    fetchSource: async () => ({
      bytes: Buffer.from('png'),
      mimeType: 'image/png',
      byteSize: 3,
      width: 1,
      height: 1,
      durationSeconds: null,
    }),
    createObjectKey: () =>
      `ai-generated/dev/users/user-1/conversations/11111111-1111-4111-8111-111111111111/runs/${runId}/asset-1.png`,
  });

  await assert.rejects(
    () => service.saveForUser({ userId: 'user-1', runId, artifactId }),
    /upload failed/,
  );

  const detail = await runRepository.getRunDetailForUser(runId, 'user-1');
  assert.equal(detail?.run.artifacts[0]?.metadata.saveStatus, 'save_failed');
});
