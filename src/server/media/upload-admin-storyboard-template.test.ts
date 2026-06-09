import assert from 'node:assert/strict';
import test from 'node:test';

import { createUploadAdminStoryboardTemplateService } from './upload-admin-storyboard-template';

test('upload admin storyboard template stores image, extracts dimensions, and returns descriptor', async () => {
  let uploadedKey = '';
  const service = createUploadAdminStoryboardTemplateService({
    cosClient: {
      async uploadObject(input) {
        uploadedKey = input.objectKey;
        return { bucket: 'bucket-a', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      async deleteObject() {},
    },
    inspectImage: async () => ({ width: 1086, height: 1448, mimeType: 'image/png' }),
    now: () => new Date('2026-06-09T10:00:00.000Z'),
    createId: () => 'upload-1',
    environmentName: 'test',
  });

  const result = await service.uploadTemplate({
    capabilityId: 'cap-1',
    filename: 'template.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
  });

  assert.equal(result.width, 1086);
  assert.equal(result.height, 1448);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.uploadedAt, '2026-06-09T10:00:00.000Z');
  assert.match(uploadedKey, /^admin-config\/test\/agent-capabilities\/cap-1\/storyboard-template\/upload-1/);
});

test('upload admin storyboard template rejects unsupported mime types', async () => {
  const service = createUploadAdminStoryboardTemplateService({
    cosClient: {
      async uploadObject() {
        throw new Error('should not upload');
      },
      async deleteObject() {},
    },
  });

  await assert.rejects(
    () =>
      service.uploadTemplate({
        capabilityId: 'cap-1',
        filename: 'template.gif',
        mimeType: 'image/gif',
        bytes: new Uint8Array([1, 2, 3]),
      }),
    /PNG、JPEG 或 WebP/,
  );
});
