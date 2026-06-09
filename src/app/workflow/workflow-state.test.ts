import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeneratedWorkflowImage,
  createWorkflowVideoModelState,
  createWorkflowVideoRestoreSnapshot,
  isWorkflowVideoHistoryRun,
  parseWorkflowDraftSnapshot,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
  resolveWorkflowVideoMaterialReadiness,
  resolveWorkflowVideoModelAvailability,
  resolveWorkflowSceneStepDreamAction,
  resolveWorkflowUploadStepNextAction,
  shouldContinueWorkflowVideoSync,
  syncWorkflowVideoRunUntilTerminal,
  type WorkflowStateSnapshot,
} from './workflow-state';
import type { AgentRunDetailDto, AgentRunDto } from '@/server/agent/types';

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

function makeRun(overrides: Partial<AgentRunDto> = {}): AgentRunDto {
  return {
    id: 'run-1',
    conversationId: 'run-1',
    taskType: 'workflow',
    status: 'running',
    prompt: 'workflow prompt',
    finalMessage: null,
    errorMessage: null,
    capabilitySummary: { provider: 'fangzhou', model: 'seedance', capabilities: [] },
    artifacts: [],
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
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

test('resolveWorkflowUploadStepNextAction only generates storyboard when no storyboard exists', () => {
  assert.equal(
    resolveWorkflowUploadStepNextAction({
      storyboardAssetId: null,
      storyboardRunId: null,
      storyboardArtifactId: null,
    }),
    'generate_storyboard',
  );
  assert.equal(
    resolveWorkflowUploadStepNextAction({
      storyboardAssetId: 'saved-storyboard',
      storyboardRunId: null,
      storyboardArtifactId: null,
    }),
    'view_storyboard',
  );
  assert.equal(
    resolveWorkflowUploadStepNextAction({
      storyboardAssetId: null,
      storyboardRunId: 'storyboard-run',
      storyboardArtifactId: 'storyboard-artifact',
    }),
    'view_storyboard',
  );
});

test('resolveWorkflowSceneStepDreamAction labels historical runs and exposes video viewing', () => {
  assert.deepEqual(resolveWorkflowSceneStepDreamAction({ dreamRunId: null, hasDreamVideo: false }), {
    label: '开始造梦',
    description: null,
    viewHistoryVideoLabel: null,
  });
  assert.deepEqual(resolveWorkflowSceneStepDreamAction({ dreamRunId: 'dream-run', hasDreamVideo: false }), {
    label: '重新生成视频',
    description: '将基于当前图案、分镜、场景和提示词新建一个视频任务，原历史记录不会被覆盖。',
    viewHistoryVideoLabel: null,
  });
  assert.deepEqual(resolveWorkflowSceneStepDreamAction({ dreamRunId: 'dream-run', hasDreamVideo: true }), {
    label: '重新生成视频',
    description: '将基于当前图案、分镜、场景和提示词新建一个视频任务，原历史记录不会被覆盖。',
    viewHistoryVideoLabel: '下一步：查看历史视频',
  });
});

test('shouldContinueWorkflowVideoSync keeps non-terminal workflow video runs polling', () => {
  assert.equal(shouldContinueWorkflowVideoSync('queued'), true);
  assert.equal(shouldContinueWorkflowVideoSync('running'), true);
  assert.equal(shouldContinueWorkflowVideoSync('succeeded'), false);
  assert.equal(shouldContinueWorkflowVideoSync('failed'), false);
});

test('syncWorkflowVideoRunUntilTerminal polls sync until the workflow video reaches a terminal status', async () => {
  const syncedRuns = [
    makeRun({ id: 'dream-run', status: 'running' }),
    makeRun({ id: 'dream-run', status: 'running' }),
    makeRun({ id: 'dream-run', status: 'succeeded' }),
  ];
  const seenStatuses: string[] = [];
  let waitCount = 0;

  const result = await syncWorkflowVideoRunUntilTerminal({
    runId: 'dream-run',
    maxAttempts: 5,
    intervalMs: 3000,
    syncRun: async () => syncedRuns.shift() ?? makeRun({ id: 'dream-run', status: 'succeeded' }),
    wait: async (durationMs) => {
      waitCount += 1;
      assert.equal(durationMs, 3000);
    },
    onRun: (run) => {
      seenStatuses.push(run.status);
    },
  });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(seenStatuses, ['running', 'running', 'succeeded']);
  assert.equal(waitCount, 2);
});

test('isWorkflowVideoHistoryRun accepts only workflow video stage runs', () => {
  assert.equal(isWorkflowVideoHistoryRun({ taskType: 'workflow', input: { stage: 'workflow_video' } }), true);
  assert.equal(isWorkflowVideoHistoryRun({ taskType: 'workflow', input: { stage: 'storyboard' } }), false);
  assert.equal(isWorkflowVideoHistoryRun({ taskType: 'video', input: { stage: 'workflow_video' } }), false);
});

test('createWorkflowVideoRestoreSnapshot restores submitted workflow material references', () => {
  const detail: AgentRunDetailDto = {
    run: makeRun({
      id: 'dream-run',
      status: 'succeeded',
      prompt: 'rendered workflow prompt',
      selectedModel: {
        id: 'video-model',
        code: 'video',
        name: 'Video Model',
        providerName: 'Provider',
        entitlementLabel: 'Free',
      },
      artifacts: [
        {
          id: 'video-artifact',
          kind: 'video',
          title: 'Generated video',
          status: 'ready',
          body: null,
          url: null,
          metadata: {},
          createdAt: '2026-06-09T00:00:00.000Z',
        },
      ],
    }),
    events: [],
    internal: {
      capabilitySnapshot: {},
      input: {
        stage: 'workflow_video',
        sourceImageAssetId: 'source-asset',
        storyboardArtifactId: 'storyboard-asset',
        sceneBackgroundId: 'scene-bg',
        modelId: 'video-model',
        storyboardPromptMap: {
          workflowPrompt: 'original workflow prompt',
          storyboardRunId: 'storyboard-run',
          storyboardArtifactId: 'storyboard-artifact',
          sourceImageOrigin: 'generated',
        },
      },
    },
  };

  assert.deepEqual(createWorkflowVideoRestoreSnapshot(detail), {
    sourceImageAssetId: 'source-asset',
    uploadedImageOrigin: 'generated',
    storyboardRunId: 'storyboard-run',
    storyboardArtifactId: 'storyboard-artifact',
    storyboardAssetId: 'storyboard-asset',
    selectedSceneBackgroundId: 'scene-bg',
    selectedVideoModel: 'video-model',
    prompt: 'original workflow prompt',
    dreamRunId: 'dream-run',
    dreamVideoArtifactId: 'video-artifact',
    step: 3,
  });
});

test('parseWorkflowDraftSnapshot restores completed workflow material references', () => {
  assert.deepEqual(
    parseWorkflowDraftSnapshot({
      version: 1,
      step: 3,
      uploadedImage: 'blob-preview',
      uploadedImageOrigin: 'manual',
      sourceImageAssetId: 'source-asset',
      selectedImageModel: 'image-model',
      storyboardGenerated: true,
      storyboardImageUrl: 'storyboard-preview',
      storyboardRunId: 'storyboard-run',
      storyboardArtifactId: 'storyboard-artifact',
      storyboardAssetId: 'storyboard-asset',
      selectedSceneBackgroundId: 'official-bg',
      prompt: 'prompt',
      selectedVideoModel: 'video-model',
      dreamRunId: 'dream-run',
      dreamVideoUrl: 'video-preview',
      dreamVideoArtifactId: 'video-artifact',
      updatedAt: '2026-06-09T00:00:00.000Z',
    }),
    {
      version: 1,
      step: 3,
      uploadedImage: 'blob-preview',
      uploadedImageOrigin: 'manual',
      sourceImageAssetId: 'source-asset',
      selectedImageModel: 'image-model',
      storyboardGenerated: true,
      storyboardImageUrl: 'storyboard-preview',
      storyboardRunId: 'storyboard-run',
      storyboardArtifactId: 'storyboard-artifact',
      storyboardAssetId: 'storyboard-asset',
      selectedSceneBackgroundId: 'official-bg',
      prompt: 'prompt',
      selectedVideoModel: 'video-model',
      dreamRunId: 'dream-run',
      dreamVideoUrl: 'video-preview',
      dreamVideoArtifactId: 'video-artifact',
      updatedAt: '2026-06-09T00:00:00.000Z',
    },
  );
});

test('parseWorkflowDraftSnapshot falls back to the earliest restorable step', () => {
  assert.equal(
    parseWorkflowDraftSnapshot({
      version: 1,
      step: 3,
      uploadedImage: null,
      sourceImageAssetId: null,
      storyboardGenerated: true,
      storyboardImageUrl: 'storyboard-preview',
      storyboardRunId: 'storyboard-run',
      storyboardArtifactId: 'storyboard-artifact',
    })?.step,
    0,
  );

  const withoutStoryboard = parseWorkflowDraftSnapshot({
    version: 1,
    step: 3,
    sourceImageAssetId: 'source-asset',
    storyboardGenerated: false,
    selectedSceneBackgroundId: 'official-bg',
  });
  assert.equal(withoutStoryboard?.step, 1);
  assert.equal(withoutStoryboard?.storyboardGenerated, false);

  assert.equal(
    parseWorkflowDraftSnapshot({
      version: 1,
      step: 3,
      sourceImageAssetId: 'source-asset',
      storyboardGenerated: true,
      storyboardImageUrl: 'storyboard-preview',
      storyboardRunId: 'storyboard-run',
      storyboardArtifactId: 'storyboard-artifact',
      selectedSceneBackgroundId: null,
    })?.step,
    2,
  );
});
