import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeneratedReferenceScene,
  createWorkflowVideoModelState,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
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

test('applyGeneratedReferenceScene writes custom scene, clears alternate scene state, and reopens scene step', () => {
  assert.deepEqual(
    applyGeneratedReferenceScene(makeSnapshot({ aiSceneGenerated: true }), 'data:image/png;base64,abc'),
    {
      step: 2,
      selectedScene: null,
      customSceneUrl: 'data:image/png;base64,abc',
      aiSceneGenerated: false,
      aiSceneGenerating: false,
      dreaming: false,
    },
  );
});
