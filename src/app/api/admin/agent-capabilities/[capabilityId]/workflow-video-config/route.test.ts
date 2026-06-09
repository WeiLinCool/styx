import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkflowVideoConfigRouteHandlers,
  parseWorkflowVideoConfigBody,
} from './route';
import { normalizeWorkflowSceneBackgrounds } from '@/server/agent/workflow-backgrounds';

const capabilityId = '66666666-6666-4666-8666-666666666666';

function createMutationHeaders() {
  return new Headers({
    'x-request-id': crypto.randomUUID(),
    'x-request-nonce': crypto.randomUUID(),
    'x-client-timestamp': String(Date.now()),
    'Idempotency-Key': `workflow-video-${crypto.randomUUID()}`,
  });
}

test('parseWorkflowVideoConfigBody accepts prompt and defaults', () => {
  const body = parseWorkflowVideoConfigBody({
    description: '视频能力',
    promptTemplate: '生成 {{workflow_prompt}}',
    defaults: { durationSeconds: 5, resolution: '720p' },
    sceneBackgrounds: [
      {
        id: 'wood-table-handmade-1',
        name: '手作桌面',
        enabled: false,
        sortOrder: 9,
      },
    ],
  });

  assert.equal(body.description, '视频能力');
  assert.equal(body.promptTemplate, '生成 {{workflow_prompt}}');
  assert.equal(body.defaults.durationSeconds, 5);
  assert.equal(body.defaults.resolution, '720p');
  assert.deepEqual(body.sceneBackgrounds, [
    {
      id: 'wood-table-handmade-1',
      name: '手作桌面',
      enabled: false,
      sortOrder: 9,
    },
  ]);
});

test('parseWorkflowVideoConfigBody rejects empty prompt', () => {
  assert.throws(
    () =>
      parseWorkflowVideoConfigBody({
        description: '视频能力',
        promptTemplate: '',
        defaults: { durationSeconds: 5, resolution: '720p' },
      }),
    /promptTemplate/,
  );
});

test('GET workflow-video-config returns skill-like config', async () => {
  const handlers = createWorkflowVideoConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getConfig: async () => ({
      capabilityId,
      capabilityCode: 'workflow-video-mvp',
      capabilityName: '工作流视频生成',
      capabilityStatus: 'enabled',
      code: 'workflow-video-mvp',
      description: '视频能力',
      inputSchema: {
        requiredMaterials: ['source_image', 'storyboard_image', 'scene_background'],
        requiredSnapshots: ['storyboard_prompt_map'],
      },
      promptTemplate: '生成 {{workflow_prompt}}',
      modelBinding: {
        providerCode: 'doubao',
        model: 'doubao-seedance-2-0',
        executionProtocol: 'video_task_polling',
      },
      defaults: { durationSeconds: 5, resolution: '720p' },
      sceneBackgrounds: normalizeWorkflowSceneBackgrounds(null),
      updatedAt: null,
      updatedByUserId: null,
    }),
    saveConfig: async () => {
      throw new Error('unexpected save');
    },
  });

  const response = await handlers.GET(
    new Request(`https://example.com/api/admin/agent-capabilities/${capabilityId}/workflow-video-config`),
    { params: Promise.resolve({ capabilityId }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.config.code, 'workflow-video-mvp');
  assert.equal(body.config.modelBinding.model, 'doubao-seedance-2-0');
});

test('PUT workflow-video-config saves parsed config', async () => {
  let savedPrompt = '';
  let savedBackgrounds: unknown = null;
  const handlers = createWorkflowVideoConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    getConfig: async () => {
      throw new Error('unexpected get');
    },
    saveConfig: async (input) => {
      savedPrompt = input.promptTemplate;
      savedBackgrounds = input.sceneBackgrounds;
      return {
        capabilityId,
        capabilityCode: 'workflow-video-mvp',
        capabilityName: '工作流视频生成',
        capabilityStatus: 'enabled',
        code: 'workflow-video-mvp',
        description: input.description,
        inputSchema: {
          requiredMaterials: ['source_image', 'storyboard_image', 'scene_background'],
          requiredSnapshots: ['storyboard_prompt_map'],
        },
        promptTemplate: input.promptTemplate,
        modelBinding: {
          providerCode: 'doubao',
          model: 'doubao-seedance-2-0',
          executionProtocol: 'video_task_polling',
        },
        defaults: input.defaults,
        sceneBackgrounds: normalizeWorkflowSceneBackgrounds(input.sceneBackgrounds),
        updatedAt: '2026-06-09T10:00:00.000Z',
        updatedByUserId: input.adminUserId,
      };
    },
  });

  const response = await handlers.PUT(
    new Request(`https://example.com/api/admin/agent-capabilities/${capabilityId}/workflow-video-config`, {
      method: 'PUT',
      headers: {
        ...Object.fromEntries(createMutationHeaders()),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        description: ' 视频能力 ',
        promptTemplate: ' 生成 {{workflow_prompt}} ',
        defaults: { durationSeconds: 5, resolution: '720p' },
        sceneBackgrounds: [
          {
            id: 'wood-table-handmade-1',
            name: ' 手作桌面 ',
            enabled: false,
            sortOrder: 9,
          },
        ],
      }),
    }),
    { params: Promise.resolve({ capabilityId }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(savedPrompt, '生成 {{workflow_prompt}}');
  assert.deepEqual(savedBackgrounds, [
    {
      id: 'wood-table-handmade-1',
      name: '手作桌面',
      enabled: false,
      sortOrder: 9,
    },
  ]);
  assert.equal(body.config.defaults.durationSeconds, 5);
  assert.equal(
    body.config.sceneBackgrounds.find(
      (background: { id: string }) => background.id === 'wood-table-handmade-1',
    ).enabled,
    false,
  );
});
