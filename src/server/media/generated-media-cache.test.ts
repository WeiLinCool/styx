import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeneratedMediaCacheService } from './generated-media-cache';

test('cache service stores provider URL media in temporary object storage', async () => {
  const uploads: Array<{ objectKey: string; contentType: string; body: Uint8Array }> = [];
  const service = createGeneratedMediaCacheService({
    cosClient: {
      uploadObject: async (input) => {
        uploads.push(input);
        return { bucket: 'bucket', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      createSignedReadUrl: async (objectKey) => `https://signed.example/${objectKey}`,
    },
    fetchSource: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      byteSize: 3,
      width: 100,
      height: 80,
      durationSeconds: null,
    }),
    now: () => new Date('2026-06-06T00:00:00.000Z'),
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    environmentName: 'test',
  });

  const cached = await service.cacheGeneratedMedia({
    userId: 'user-1',
    runId: 'run-1',
    artifactId: 'artifact-1',
    kind: 'image',
    title: 'Generated image',
    sourceUrl: 'https://provider.example/image.png',
  });

  assert.equal(cached.objectKey, 'ai-generated-cache/test/users/user-1/runs/run-1/artifact-1.png');
  assert.equal(cached.expiresAt, '2026-06-13T00:00:00.000Z');
  assert.equal(cached.mimeType, 'image/png');
  assert.equal(cached.byteSize, 3);
  assert.equal(cached.width, 100);
  assert.equal(cached.height, 80);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]?.contentType, 'image/png');
});

test('cache service stores data URL media without fetching source URL', async () => {
  let fetches = 0;
  const service = createGeneratedMediaCacheService({
    cosClient: {
      uploadObject: async (input) => ({
        bucket: 'bucket',
        region: 'ap-shanghai',
        objectKey: input.objectKey,
      }),
      createSignedReadUrl: async (objectKey) => `https://signed.example/${objectKey}`,
    },
    fetchSource: async () => {
      fetches += 1;
      throw new Error('fetch should not be called');
    },
    now: () => new Date('2026-06-06T00:00:00.000Z'),
    retentionMs: 1000,
    environmentName: 'test',
  });

  const cached = await service.cacheGeneratedMedia({
    userId: 'user-1',
    runId: 'run-1',
    artifactId: 'artifact-2',
    kind: 'image',
    title: 'Generated image',
    dataUrl: `data:image/webp;base64,${Buffer.from('webp').toString('base64')}`,
  });

  assert.equal(fetches, 0);
  assert.equal(cached.mimeType, 'image/webp');
  assert.equal(cached.byteSize, 4);
  assert.equal(cached.objectKey, 'ai-generated-cache/test/users/user-1/runs/run-1/artifact-2.webp');
});

test('cache service signs temporary preview access', async () => {
  const service = createGeneratedMediaCacheService({
    cosClient: {
      uploadObject: async (input) => ({
        bucket: 'bucket',
        region: 'ap-shanghai',
        objectKey: input.objectKey,
      }),
      createSignedReadUrl: async (objectKey, expiresInSeconds) =>
        `https://signed.example/${objectKey}?expires=${expiresInSeconds}`,
    },
    fetchSource: async () => {
      throw new Error('unused');
    },
    now: () => new Date('2026-06-06T00:00:00.000Z'),
    retentionMs: 1000,
    environmentName: 'test',
  });

  const access = await service.createPreviewAccess({
    objectKey: 'cache/object.png',
    expiresInSeconds: 300,
  });

  assert.equal(access.url, 'https://signed.example/cache/object.png?expires=300');
  assert.equal(access.expiresAt, '2026-06-06T00:05:00.000Z');
});

test('cache service rejects missing source media', async () => {
  const service = createGeneratedMediaCacheService({
    cosClient: {
      uploadObject: async (input) => ({
        bucket: 'bucket',
        region: 'ap-shanghai',
        objectKey: input.objectKey,
      }),
      createSignedReadUrl: async (objectKey) => `https://signed.example/${objectKey}`,
    },
    fetchSource: async () => {
      throw new Error('unused');
    },
    now: () => new Date('2026-06-06T00:00:00.000Z'),
    retentionMs: 1000,
    environmentName: 'test',
  });

  await assert.rejects(
    () =>
      service.cacheGeneratedMedia({
        userId: 'user-1',
        runId: 'run-1',
        artifactId: 'artifact-1',
        kind: 'image',
        title: 'Generated image',
      }),
    /generated media cache requires sourceUrl or dataUrl/,
  );
});

test('cache service rejects unsupported data URL media type', async () => {
  const service = createGeneratedMediaCacheService({
    cosClient: {
      uploadObject: async (input) => ({
        bucket: 'bucket',
        region: 'ap-shanghai',
        objectKey: input.objectKey,
      }),
      createSignedReadUrl: async (objectKey) => `https://signed.example/${objectKey}`,
    },
    fetchSource: async () => {
      throw new Error('unused');
    },
    now: () => new Date('2026-06-06T00:00:00.000Z'),
    retentionMs: 1000,
    environmentName: 'test',
  });

  await assert.rejects(
    () =>
      service.cacheGeneratedMedia({
        userId: 'user-1',
        runId: 'run-1',
        artifactId: 'artifact-1',
        kind: 'image',
        title: 'Generated image',
        dataUrl: `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`,
      }),
    /unsupported generated media type/,
  );
});
