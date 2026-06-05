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
