import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStoryboardConfigRouteHandlers,
  parseStoryboardConfigFormData,
} from './route';

const capabilityId = '55555555-5555-4555-8555-555555555555';

function createMutationHeaders() {
  return new Headers({
    'x-request-id': crypto.randomUUID(),
    'x-request-nonce': crypto.randomUUID(),
    'x-client-timestamp': String(Date.now()),
    'Idempotency-Key': `storyboard-${crypto.randomUUID()}`,
  });
}

test('parseStoryboardConfigFormData reads prompt and optional template file', async () => {
  const formData = new FormData();
  formData.set('promptText', '  full prompt  ');
  formData.set(
    'templateFile',
    new File([new Uint8Array([1, 2, 3])], 'template.png', { type: 'image/png' }),
  );

  const parsed = await parseStoryboardConfigFormData({
    formData: async () => formData,
  });

  assert.equal(parsed.promptText, 'full prompt');
  assert.equal(parsed.templateFile instanceof File, true);
  assert.equal(parsed.templateFile?.name, 'template.png');
});

test('GET storyboard-config returns prompt, layout, template metadata, and preview url', async () => {
  const handlers = createStoryboardConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getConfig: async () => ({
      capabilityId: 'cap-1',
      capabilityCode: 'workflow-storyboard-template',
      capabilityName: '工作流分镜模板',
      capabilityStatus: 'enabled',
      code: 'workflow-storyboard-template',
      promptText: 'full prompt',
      templateAsset: {
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'storyboard/template.png',
        mimeType: 'image/png',
        byteSize: 1024,
        width: 1086,
        height: 1448,
        originalFilename: 'template.png',
        uploadedAt: '2026-06-09T10:00:00.000Z',
      },
      layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
      updatedAt: '2026-06-09T10:00:00.000Z',
      updatedByUserId: 'admin-1',
    }),
    saveConfig: async () => {
      throw new Error('unexpected save');
    },
    uploadTemplate: async () => {
      throw new Error('unexpected upload');
    },
    deleteObject: async () => {},
    createPreviewUrl: async () => 'https://signed.example/storyboard/template.png',
  });

  const response = await handlers.GET(new Request(`https://example.com/api/admin/agent-capabilities/${capabilityId}/storyboard-config`), {
    params: Promise.resolve({ capabilityId }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.config.promptText, 'full prompt');
  assert.equal(body.config.layout.width, 1086);
  assert.equal(body.config.previewUrl, 'https://signed.example/storyboard/template.png');
});

test('PUT storyboard-config rejects empty prompt text', async () => {
  const handlers = createStoryboardConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getConfig: async () => ({
      capabilityId,
      capabilityCode: 'workflow-storyboard-template',
      capabilityName: '工作流分镜模板',
      capabilityStatus: 'enabled',
      code: 'workflow-storyboard-template',
      promptText: 'existing',
      templateAsset: null,
      layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
      updatedAt: null,
      updatedByUserId: null,
    }),
    saveConfig: async () => {
      throw new Error('unexpected save');
    },
    uploadTemplate: async () => {
      throw new Error('unexpected upload');
    },
    deleteObject: async () => {},
    createPreviewUrl: async () => null,
  });

  const formData = new FormData();
  formData.set('promptText', '   ');

  const response = await handlers.PUT(
    new Request(`https://example.com/api/admin/agent-capabilities/${capabilityId}/storyboard-config`, {
      method: 'PUT',
      headers: createMutationHeaders(),
      body: formData,
    }),
    { params: Promise.resolve({ capabilityId }) },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'validation_error');
});

test('PUT storyboard-config rejects missing template when no existing template is configured', async () => {
  const handlers = createStoryboardConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getConfig: async () => ({
      capabilityId,
      capabilityCode: 'workflow-storyboard-template',
      capabilityName: '工作流分镜模板',
      capabilityStatus: 'enabled',
      code: 'workflow-storyboard-template',
      promptText: 'existing',
      templateAsset: null,
      layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
      updatedAt: null,
      updatedByUserId: null,
    }),
    saveConfig: async () => {
      throw new Error('unexpected save');
    },
    uploadTemplate: async () => {
      throw new Error('unexpected upload');
    },
    deleteObject: async () => {},
    createPreviewUrl: async () => null,
  });

  const formData = new FormData();
  formData.set('promptText', 'new prompt');

  const response = await handlers.PUT(
    new Request(`https://example.com/api/admin/agent-capabilities/${capabilityId}/storyboard-config`, {
      method: 'PUT',
      headers: createMutationHeaders(),
      body: formData,
    }),
    { params: Promise.resolve({ capabilityId }) },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'validation_error');
  assert.match(body.error.message, /上传模板图/);
});

test('PUT storyboard-config accepts prompt-only updates when existing template already exists', async () => {
  let savedPrompt = '';
  const handlers = createStoryboardConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getConfig: async () => ({
      capabilityId,
      capabilityCode: 'workflow-storyboard-template',
      capabilityName: '工作流分镜模板',
      capabilityStatus: 'enabled',
      code: 'workflow-storyboard-template',
      promptText: 'existing',
      templateAsset: {
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'storyboard/existing.png',
        mimeType: 'image/png',
        byteSize: 1024,
        width: 1086,
        height: 1448,
        originalFilename: 'existing.png',
        uploadedAt: '2026-06-09T10:00:00.000Z',
      },
      layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
      updatedAt: null,
      updatedByUserId: null,
    }),
    saveConfig: async (input) => {
      savedPrompt = input.promptText;
      return {
        capabilityId,
        capabilityCode: 'workflow-storyboard-template',
        capabilityName: '工作流分镜模板',
        capabilityStatus: 'enabled',
        code: 'workflow-storyboard-template',
        promptText: input.promptText,
        templateAsset: {
          storageProvider: 'tencent_cos',
          bucket: 'bucket-a',
          region: 'ap-shanghai',
          objectKey: 'storyboard/existing.png',
          mimeType: 'image/png',
          byteSize: 1024,
          width: 1086,
          height: 1448,
          originalFilename: 'existing.png',
          uploadedAt: '2026-06-09T10:00:00.000Z',
        },
        layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
        updatedAt: '2026-06-09T11:00:00.000Z',
        updatedByUserId: 'admin-1',
      };
    },
    uploadTemplate: async () => {
      throw new Error('unexpected upload');
    },
    deleteObject: async () => {},
    createPreviewUrl: async () => 'https://signed.example/storyboard/existing.png',
  });

  const formData = new FormData();
  formData.set('promptText', 'updated prompt');

  const response = await handlers.PUT(
    new Request(`https://example.com/api/admin/agent-capabilities/${capabilityId}/storyboard-config`, {
      method: 'PUT',
      headers: createMutationHeaders(),
      body: formData,
    }),
    { params: Promise.resolve({ capabilityId }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(savedPrompt, 'updated prompt');
  assert.equal(body.config.previewUrl, 'https://signed.example/storyboard/existing.png');
});
