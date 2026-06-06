import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { createMemoryUserStorageRepository } from '@/server/repositories/users';

import { createUploadUserMediaService } from './upload-user-media';

test('upload user media stores uploaded image in cos and creates unified asset', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const storageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });
  let uploadedKey = '';

  const service = createUploadUserMediaService({
    mediaAssetRepository: repository,
    userStorageRepository: storageRepository,
    cosClient: {
      async uploadObject(input) {
        uploadedKey = input.objectKey;
        return { bucket: 'bucket-a', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      async deleteObject() {},
    },
    createObjectKey: ({ userId, assetId, filename }) =>
      `user-uploaded/test/users/${userId}/assets/${assetId}/${filename}`,
    computeSha256: async () => 'sha256-1',
  });

  const result = await service.uploadForUser({
    userId: 'user-1',
    title: 'My upload',
    filename: 'photo.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
  });

  assert.equal(result.asset.sourceType, 'user_uploaded');
  assert.equal(result.asset.originalFilename, 'photo.png');
  assert.equal(result.asset.shareStatus, 'disabled');
  assert.equal(uploadedKey, result.asset.objectKey);
  assert.match(uploadedKey, /^user-uploaded\/test\/users\/user-1\/assets\/.+\/photo\.png$/);

  const quota = await storageRepository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 10_000, storageUsedBytes: 3 });
});

test('upload user media stores uploaded audio in cos and creates unified asset', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const storageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });
  let uploadedKey = '';

  const service = createUploadUserMediaService({
    mediaAssetRepository: repository,
    userStorageRepository: storageRepository,
    cosClient: {
      async uploadObject(input) {
        uploadedKey = input.objectKey;
        return { bucket: 'bucket-a', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      async deleteObject() {},
    },
    createObjectKey: ({ userId, assetId, filename }) =>
      `user-uploaded/test/users/${userId}/assets/${assetId}/${filename}`,
    computeSha256: async () => 'sha256-audio',
  });

  const result = await service.uploadForUser({
    userId: 'user-1',
    title: 'Song',
    filename: 'song.mp3',
    mimeType: 'audio/mpeg',
    bytes: new Uint8Array([1, 2, 3, 4]),
  });

  assert.equal(result.asset.kind, 'audio');
  assert.equal(result.asset.mimeType, 'audio/mpeg');
  assert.equal(result.asset.originalFilename, 'song.mp3');
  assert.equal(result.asset.sourceType, 'user_uploaded');
  assert.equal(uploadedKey, result.asset.objectKey);
  assert.match(uploadedKey, /^user-uploaded\/test\/users\/user-1\/assets\/.+\/song\.mp3$/);

  const quota = await storageRepository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 10_000, storageUsedBytes: 4 });
});

test('upload user media rejects quota overflow before recording asset', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const storageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 2, storageUsedBytes: 0 },
  });

  const service = createUploadUserMediaService({
    mediaAssetRepository: repository,
    userStorageRepository: storageRepository,
    cosClient: {
      async uploadObject() {
        throw new Error('should not upload');
      },
      async deleteObject() {},
    },
    createObjectKey: ({ userId, assetId, filename }) =>
      `user-uploaded/test/users/${userId}/assets/${assetId}/${filename}`,
    computeSha256: async () => 'sha256-1',
  });

  await assert.rejects(
    () =>
      service.uploadForUser({
        userId: 'user-1',
        title: 'Too large',
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        bytes: new Uint8Array([1, 2, 3]),
      }),
    /存储空间不足/,
  );

  const listed = await repository.listSavedAssetsForUser('user-1');
  assert.equal(listed.length, 0);
});

test('upload user media rejects unsupported mime type', async () => {
  const repository = createMemoryGeneratedMediaAssetRepository();
  const storageRepository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 10_000, storageUsedBytes: 0 },
  });

  const service = createUploadUserMediaService({
    mediaAssetRepository: repository,
    userStorageRepository: storageRepository,
    cosClient: {
      async uploadObject() {
        throw new Error('should not upload');
      },
      async deleteObject() {},
    },
    createObjectKey: ({ userId, assetId, filename }) =>
      `user-uploaded/test/users/${userId}/assets/${assetId}/${filename}`,
    computeSha256: async () => 'sha256-1',
  });

  await assert.rejects(
    () =>
      service.uploadForUser({
        userId: 'user-1',
        title: 'Unsupported',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
      }),
    /仅支持上传图片、音频或视频/,
  );
});
