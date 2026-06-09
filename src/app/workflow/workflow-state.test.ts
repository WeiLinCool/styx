import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeneratedWorkflowImage,
  createWorkflowVideoModelState,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
  resolveWorkflowVideoMaterialReadiness,
  resolveWorkflowVideoModelAvailability,
  type WorkflowStateSnapshot,
} from './workflow-state';

function makeSnapshot(overrides: Partial<WorkflowStateSnapshot> = {}): WorkflowStateSnapshot {
  return {
    step: 3,
    storyboardGenerated: true,
    storyboardGenerating: false,
    selectedScene: 'workshop',
    customSceneUrl: null,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: true,
    ...overrides,
  };
}

test('createWorkflowVideoModelState preserves a valid selection and falls back to server default', () => {
  assert.deepEqual(
    createWorkflowVideoModelState(
      [
        { id: 'video-a', isDefault: false },
        { id: 'video-b', isDefault: true },
      ],
      'video-a',
    ),
    { selectedModelId: 'video-a', hasModels: true },
  );

  assert.deepEqual(
    createWorkflowVideoModelState(
      [
        { id: 'video-a', isDefault: false },
        { id: 'video-b', isDefault: true },
      ],
      'missing',
    ),
    { selectedModelId: 'video-b', hasModels: true },
  );
});

test('createWorkflowVideoModelState returns empty selection when config has no models', () => {
  assert.deepEqual(createWorkflowVideoModelState([], 'missing'), {
    selectedModelId: null,
    hasModels: false,
  });
});

test('createWorkflowVideoModelState falls back to the first model when no default exists', () => {
  assert.deepEqual(
    createWorkflowVideoModelState(
      [
        { id: 'video-a', isDefault: false },
        { id: 'video-b', isDefault: false },
      ],
      null,
    ),
    { selectedModelId: 'video-a', hasModels: true },
  );
});

test('resolveWorkflowVideoModelAvailability marks enabled configs with models as ready', () => {
  assert.deepEqual(
    resolveWorkflowVideoModelAvailability(
      {
        enabled: true,
        upgradeRequired: false,
        message: null,
        models: [
          { id: 'video-a', isDefault: false },
          { id: 'video-b', isDefault: true },
        ],
      },
      'missing',
    ),
    {
      selectedModelId: 'video-b',
      status: 'ready',
      message: null,
    },
  );
});

test('resolveWorkflowVideoModelAvailability marks enabled configs without models as maintenance', () => {
  assert.deepEqual(
    resolveWorkflowVideoModelAvailability(
      {
        enabled: true,
        upgradeRequired: false,
        message: null,
        models: [],
      },
      null,
    ),
    {
      selectedModelId: null,
      status: 'maintenance',
      message: '功能不可用，正在维护',
    },
  );
});

test('resolveWorkflowVideoModelAvailability preserves disabled-state messaging', () => {
  assert.deepEqual(
    resolveWorkflowVideoModelAvailability(
      {
        enabled: false,
        upgradeRequired: true,
        message: null,
        models: [],
      },
      null,
    ),
    {
      selectedModelId: null,
      status: 'maintenance',
      message: 'AI 视频生成是会员权益，开通会员后即可使用。',
    },
  );
});

test('resetWorkflowForImageSourceChange clears downstream progress and returns to upload step', () => {
  assert.deepEqual(resetWorkflowForImageSourceChange(makeSnapshot()), {
    step: 0,
    storyboardGenerated: false,
    storyboardGenerating: false,
    selectedScene: null,
    customSceneUrl: null,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: false,
  });
});

test('resetWorkflowForSceneChange clears dream state and sends step-three users back to scene step', () => {
  assert.deepEqual(resetWorkflowForSceneChange(makeSnapshot()), {
    step: 2,
    dreaming: false,
  });

  assert.deepEqual(
    resetWorkflowForSceneChange(makeSnapshot({ step: 2, dreaming: false })),
    {
      step: 2,
      dreaming: false,
    },
  );
});

test('applyGeneratedWorkflowImage returns the image URL and preserves whether a manual upload exists', () => {
  assert.deepEqual(
    applyGeneratedWorkflowImage(makeSnapshot({ step: 0 }), 'data:image/png;base64,xyz', true),
    {
      imageUrl: 'data:image/png;base64,xyz',
      hasManualUpload: true,
      resetState: {
        step: 0,
        storyboardGenerated: false,
        storyboardGenerating: false,
        selectedScene: null,
        customSceneUrl: null,
        aiSceneGenerated: false,
        aiSceneGenerating: false,
        dreaming: false,
      },
    },
  );
});

test('resolveWorkflowVideoMaterialReadiness requires real source, storyboard, and scene materials', () => {
  assert.deepEqual(
    resolveWorkflowVideoMaterialReadiness({
      hasSourceImageAsset: false,
      hasSourceImageFile: false,
      hasStoryboardAsset: true,
      hasStoryboardRunArtifact: true,
      hasSelectedConfiguredBackground: true,
    }),
    {
      ready: false,
      message: '请上传本地原图后再生成视频。',
    },
  );

  assert.deepEqual(
    resolveWorkflowVideoMaterialReadiness({
      hasSourceImageAsset: true,
      hasSourceImageFile: false,
      hasStoryboardAsset: false,
      hasStoryboardRunArtifact: false,
      hasSelectedConfiguredBackground: true,
    }),
    {
      ready: false,
      message: '请先生成12宫格分镜图。',
    },
  );

  assert.deepEqual(
    resolveWorkflowVideoMaterialReadiness({
      hasSourceImageAsset: true,
      hasSourceImageFile: false,
      hasStoryboardAsset: true,
      hasStoryboardRunArtifact: false,
      hasSelectedConfiguredBackground: false,
    }),
    {
      ready: false,
      message: '请先选择官网背景图后再生成视频。',
    },
  );

  assert.deepEqual(
    resolveWorkflowVideoMaterialReadiness({
      hasSourceImageAsset: false,
      hasSourceImageFile: true,
      hasStoryboardAsset: false,
      hasStoryboardRunArtifact: true,
      hasSelectedConfiguredBackground: true,
    }),
    {
      ready: true,
      message: null,
    },
  );
});
