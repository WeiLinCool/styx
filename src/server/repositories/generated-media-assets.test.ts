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
    sourceType: 'ai_generated',
    sourceProvider: 'doubao',
    sourceModel: 'seedream-3',
    sourceUrl: 'https://provider.example/output.png',
    sourceExpiresAt: '2026-06-03T12:00:00.000Z',
    originalFilename: null,
    sha256: null,
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
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
    sourceType: 'ai_generated',
    sourceProvider: 'doubao',
    sourceModel: 'seedance-1',
    sourceUrl: 'https://provider.example/output.mp4',
    sourceExpiresAt: '2026-06-03T12:00:00.000Z',
    originalFilename: null,
    sha256: null,
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
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

test('generated media asset repository finds asset for owning user only', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const created = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'audio',
    title: 'Uploaded audio',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'song.mp3',
    sha256: 'sha256-audio',
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-audio/song.mp3',
    mimeType: 'audio/mpeg',
    byteSize: 128,
    width: null,
    height: null,
    durationSeconds: null,
    metadata: {},
  });

  assert.equal(
    (
      await repository.findAssetForUser({
        userId: 'user-1',
        assetId: created.id,
      })
    )?.id,
    created.id,
  );
  assert.equal(
    await repository.findAssetForUser({
      userId: 'user-2',
      assetId: created.id,
    }),
    null,
  );
  assert.equal(
    await repository.findAssetForUser({
      userId: 'user-1',
      assetId: 'missing-asset',
    }),
    null,
  );
});

test('generated media asset repository stores user-uploaded source metadata and share state', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'Uploaded image',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'photo.png',
    sha256: 'sha256-1',
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-1/photo.png',
    mimeType: 'image/png',
    byteSize: 12,
    width: 100,
    height: 100,
    durationSeconds: null,
    metadata: {},
  });

  assert.equal(asset.sourceType, 'user_uploaded');
  assert.equal(asset.originalFilename, 'photo.png');
  assert.equal(asset.shareStatus, 'disabled');
  assert.equal(asset.shareId, null);
});

test('generated media asset repository preserves ai-generated source metadata', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();

  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: 'run-1',
    conversationId: 'conversation-1',
    artifactId: 'artifact-1',
    kind: 'video',
    title: 'Saved video',
    sourceType: 'ai_generated',
    sourceProvider: 'doubao',
    sourceModel: 'seed-video',
    sourceUrl: 'https://provider.example/video.mp4',
    sourceExpiresAt: '2026-06-04T10:00:00.000Z',
    originalFilename: null,
    sha256: null,
    shareId: 'share-1',
    shareStatus: 'active',
    sharedAt: '2026-06-04T10:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-1.mp4',
    mimeType: 'video/mp4',
    byteSize: 128,
    width: 1920,
    height: 1080,
    durationSeconds: 3.2,
    metadata: {},
  });

  assert.equal(asset.sourceType, 'ai_generated');
  assert.equal(asset.sourceProvider, 'doubao');
  assert.equal(asset.shareStatus, 'active');
  assert.equal(asset.shareId, 'share-1');
});

test('generated media asset repository enables and disables sharing', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'Shareable image',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'share.png',
    sha256: 'sha256-share',
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-share/share.png',
    mimeType: 'image/png',
    byteSize: 12,
    width: 100,
    height: 100,
    durationSeconds: null,
    metadata: {},
  });

  const shared = await repository.enableSharingForUser(asset.id, asset.userId, {
    shareId: 'share-1',
    sharedAt: '2026-06-04T10:00:00.000Z',
  });
  assert.equal(shared?.shareStatus, 'active');
  assert.equal(shared?.shareId, 'share-1');

  const disabled = await repository.disableSharingForUser(asset.id, asset.userId);
  assert.equal(disabled?.shareStatus, 'disabled');
});

test('generated media asset repository resolves active share by shareId only for non-deleted assets', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'video',
    title: 'Shared video',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'share.mp4',
    sha256: 'sha256-video',
    shareId: 'share-video',
    shareStatus: 'active',
    sharedAt: '2026-06-04T10:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-share/share.mp4',
    mimeType: 'video/mp4',
    byteSize: 128,
    width: 1280,
    height: 720,
    durationSeconds: 3.2,
    metadata: {},
  });

  const shared = await repository.getActiveSharedAssetByShareId('share-video');
  assert.equal(shared?.id, asset.id);

  await repository.softDeleteSavedAssetForUser(asset.id, asset.userId);
  assert.equal(await repository.getActiveSharedAssetByShareId('share-video'), null);
});

test('soft delete clears active sharing from public resolution', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'Delete me',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'delete.png',
    sha256: 'sha256-delete',
    shareId: 'share-delete',
    shareStatus: 'active',
    sharedAt: '2026-06-04T10:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-delete/delete.png',
    mimeType: 'image/png',
    byteSize: 12,
    width: 100,
    height: 100,
    durationSeconds: null,
    metadata: {},
  });

  const deleted = await repository.softDeleteSavedAssetForUser(asset.id, asset.userId);
  assert.equal(deleted?.shareStatus, 'disabled');
  assert.equal(await repository.getActiveSharedAssetByShareId('share-delete'), null);
});

test('generated media asset repository updates title for owning user only', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'Original title',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    sourceUrl: null,
    sourceExpiresAt: null,
    originalFilename: 'photo.png',
    sha256: 'sha256-title',
    shareId: 'share-title',
    shareStatus: 'active',
    sharedAt: '2026-06-04T10:00:00.000Z',
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'user-uploaded/dev/users/user-1/assets/asset-title/photo.png',
    mimeType: 'image/png',
    byteSize: 12,
    width: 100,
    height: 100,
    durationSeconds: null,
    metadata: {},
  });

  const updated = await repository.updateSavedAssetTitleForUser(asset.id, asset.userId, 'Renamed title');
  assert.equal(updated?.title, 'Renamed title');
  assert.equal(updated?.objectKey, asset.objectKey);
  assert.equal(updated?.shareId, asset.shareId);
  assert.equal(updated?.originalFilename, asset.originalFilename);
});

test('generated media asset repository rejects title update for non-owner or deleted asset', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const asset = await repository.createSavedAsset({
    userId: 'user-1',
    runId: 'run-1',
    conversationId: 'conversation-1',
    artifactId: 'artifact-1',
    kind: 'video',
    title: 'AI video',
    sourceType: 'ai_generated',
    sourceProvider: 'doubao',
    sourceModel: 'seed-video',
    sourceUrl: 'https://provider.example/video.mp4',
    sourceExpiresAt: '2026-06-04T10:00:00.000Z',
    originalFilename: null,
    sha256: null,
    shareId: null,
    shareStatus: 'disabled',
    sharedAt: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket-a',
    region: 'ap-shanghai',
    objectKey: 'ai-generated/dev/users/user-1/conversations/conversation-1/runs/run-1/asset-1.mp4',
    mimeType: 'video/mp4',
    byteSize: 128,
    width: 1920,
    height: 1080,
    durationSeconds: 3.2,
    metadata: {},
  });

  assert.equal(
    await repository.updateSavedAssetTitleForUser(asset.id, 'user-2', 'Should fail'),
    null,
  );

  await repository.softDeleteSavedAssetForUser(asset.id, asset.userId);
  assert.equal(
    await repository.updateSavedAssetTitleForUser(asset.id, asset.userId, 'Should also fail'),
    null,
  );
});
