import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSeedAgentCapabilityAdminData,
  getDefaultAgentCapabilityBundle,
  readStoryboardCapabilityConfig,
  readWorkflowVideoMvpCapabilityConfig,
  seedAgentCapabilities,
  seedAgentCapabilityBundles,
  validateWorkflowVideoMvpCapabilityDraft,
} from './agent-capabilities';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('seed agent capability and bundle ids are stable UUID strings', () => {
  const ids = [
    ...seedAgentCapabilities.map((capability) => capability.id),
    ...seedAgentCapabilityBundles.map((bundle) => bundle.id),
  ];

  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.match(id, uuidPattern);
  }
});

test('getSeedAgentCapabilityAdminData exposes capability records and metrics', () => {
  const data = getSeedAgentCapabilityAdminData();

  assert.equal(data.source, 'seed');
  assert.ok(data.records.some((record) => record.kind === 'skill'));
  assert.ok(data.bundles.some((bundle) => bundle.code === 'workflow-default'));
  assert.ok(data.metrics.some((metric) => metric.label === '能力数'));
});

test('seed default bundle resolves model, skill, mcp and plugin capabilities for user runtime', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');

  assert.equal(snapshot?.provider, 'pi');
  assert.equal(snapshot?.model, 'pi-default');
  assert.ok(snapshot?.capabilities.some((capability) => capability.kind === 'skill'));
  assert.ok(snapshot?.capabilities.some((capability) => capability.kind === 'mcp_server'));
  assert.ok(snapshot?.capabilities.some((capability) => capability.kind === 'plugin'));
});

test('readStoryboardCapabilityConfig returns storyboard prompt and layout config from workflow snapshot', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');

  assert.ok(snapshot);

  const config = readStoryboardCapabilityConfig(snapshot!);

  assert.equal(config?.code, 'workflow-storyboard-template');
  assert.equal(config?.promptText.includes('{{workflow_prompt}}'), true);
  assert.equal(config?.layout.width, 1086);
  assert.equal(config?.layout.height, 1448);
  assert.equal(config?.layout.columns, 4);
  assert.equal(config?.layout.rows, 3);
  assert.equal(config?.templateAsset, null);
});

test('readWorkflowVideoMvpCapabilityConfig returns skill-like workflow video config', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');

  assert.ok(snapshot);

  const config = readWorkflowVideoMvpCapabilityConfig(snapshot!);

  assert.equal(config?.code, 'workflow-video-mvp');
  assert.equal(config?.modelBinding.providerCode, 'doubao');
  assert.equal(config?.modelBinding.model, 'doubao-seedance-2-0');
  assert.equal(config?.modelBinding.executionProtocol, 'video_task_polling');
  assert.deepEqual(config?.inputSchema.requiredMaterials, [
    'source_image',
    'storyboard_image',
    'scene_background',
  ]);
  assert.deepEqual(config?.inputSchema.requiredSnapshots, ['storyboard_prompt_map']);
  assert.equal(config?.defaults.durationSeconds, 5);
  assert.equal(config?.defaults.resolution, '720p');
});

test('readWorkflowVideoMvpCapabilityConfig preserves configured workflow video model binding', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');
  assert.ok(snapshot);

  const capability = snapshot!.capabilities.find((item) => item.code === 'workflow-video-mvp');
  assert.ok(capability);
  capability.config = {
    ...(capability.config as Record<string, unknown>),
    modelBinding: {
      providerCode: 'doubao',
      model: 'doubao-seedance-2-0-fast-260128',
      executionProtocol: 'video_task_polling',
    },
  };

  const config = readWorkflowVideoMvpCapabilityConfig(snapshot!);

  assert.equal(config?.modelBinding.providerCode, 'doubao');
  assert.equal(config?.modelBinding.model, 'doubao-seedance-2-0-fast-260128');
  assert.equal(config?.modelBinding.executionProtocol, 'video_task_polling');
});

test('readWorkflowVideoMvpCapabilityConfig includes enabled official scene backgrounds', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');
  const config = readWorkflowVideoMvpCapabilityConfig(snapshot!);

  assert.ok(config);
  assert.ok(config.sceneBackgrounds.length >= 50);
  assert.ok(
    config.sceneBackgrounds.every((background) =>
      background.publicUrl.startsWith('/workflow-backgrounds/'),
    ),
  );
  assert.ok(config.sceneBackgrounds.every((background) => background.enabled));
});

test('validateWorkflowVideoMvpCapabilityDraft preserves configured background edits', () => {
  const draft = validateWorkflowVideoMvpCapabilityDraft({
    description: '工作流视频',
    promptTemplate: 'prompt',
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

  const edited = draft.sceneBackgrounds.find(
    (background) => background.id === 'wood-table-handmade-1',
  );
  assert.equal(edited?.name, '手作桌面');
  assert.equal(edited?.enabled, false);
  assert.equal(edited?.sortOrder, 9);
});

test('validateWorkflowVideoMvpCapabilityDraft rejects empty prompt templates', () => {
  assert.throws(
    () =>
      validateWorkflowVideoMvpCapabilityDraft({
        description: '工作流视频',
        promptTemplate: '   ',
        defaults: { durationSeconds: 5, resolution: '720p' },
      }),
    /视频提示词不能为空/,
  );
});
