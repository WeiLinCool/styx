import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryGeneratedMediaAssetRepository } from './generated-media-assets';

test('generated media asset repository creates and lists user-owned saved assets', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const created = await repository.createSavedAsset({
    userId: 'user-1',
    runId: 'run-1',
    conversationId: 'conversation-1',
    artifactId: 'artifact-1',
    kind: 'image',
    title: '封面图',
    sourceProvider: 'doubao',
    sourceModel: 'seedream-3',
    sourceUrl: 'https://provider.example/output.png',
    sourceExpiresAt: '2026-06-03T12:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-1.png',
    mimeType: 'image/png',
    byteSize: 1024,
    width: 512,
    height: 512,
    durationSeconds: null,
    metadata: {},
  });

  assert.equal(created.userId, 'user-1');

  const listed = await repository.listSavedAssetsForUser('user-1');
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);
  assert.equal(listed[0]?.objectKey, created.objectKey);
});

test('generated media asset repository finds and soft deletes saved assets per user', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const created = await repository.createSavedAsset({
    userId: 'user-1',
    runId: 'run-1',
    conversationId: 'conversation-1',
    artifactId: 'artifact-1',
    kind: 'video',
    title: '生成视频',
    sourceProvider: 'doubao',
    sourceModel: 'seedance-1',
    sourceUrl: 'https://provider.example/output.mp4',
    sourceExpiresAt: '2026-06-03T12:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-2.mp4',
    mimeType: 'video/mp4',
    byteSize: 4096,
    width: 1280,
    height: 720,
    durationSeconds: 5,
    metadata: {},
  });

  const found = await repository.findSavedAssetBySource({
    userId: 'user-1',
    runId: 'run-1',
    artifactId: 'artifact-1',
  });
  assert.equal(found?.id, created.id);

  const deleted = await repository.softDeleteSavedAssetForUser(created.id, 'user-1');
  assert.equal(deleted?.status, 'deleted');

  const listed = await repository.listSavedAssetsForUser('user-1');
  assert.equal(listed.length, 0);
  assert.equal(await repository.getSavedAssetForUser(created.id, 'user-1'), null);
});
