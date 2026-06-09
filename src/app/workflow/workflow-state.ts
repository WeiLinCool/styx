import { buildUnavailableModelMessage } from '@/features/public/model-availability';
import type { AgentRunDetailDto, AgentTaskType } from '@/server/agent/types';

type SelectableModel = {
  id: string;
  isDefault: boolean;
};

type WorkflowVideoConfigSnapshot = {
  enabled: boolean;
  upgradeRequired: boolean;
  message: string | null;
  models: SelectableModel[];
};

export type WorkflowStateSnapshot = {
  step: number;
  storyboardGenerated: boolean;
  storyboardGenerating: boolean;
  selectedScene: string | null;
  customSceneUrl: string | null;
  aiSceneGenerated: boolean;
  aiSceneGenerating: boolean;
  dreaming: boolean;
};

export type WorkflowDraftSnapshot = {
  version: 1;
  step: number;
  uploadedImage: string | null;
  uploadedImageOrigin: 'manual' | 'generated' | null;
  sourceImageAssetId: string | null;
  selectedImageModel: string | null;
  storyboardGenerated: boolean;
  storyboardImageUrl: string | null;
  storyboardRunId: string | null;
  storyboardArtifactId: string | null;
  storyboardAssetId: string | null;
  selectedSceneBackgroundId: string | null;
  prompt: string;
  selectedVideoModel: string | null;
  dreamRunId: string | null;
  dreamVideoUrl: string | null;
  dreamVideoArtifactId: string | null;
  updatedAt: string;
};

export type WorkflowVideoRestoreSnapshot = {
  sourceImageAssetId: string | null;
  uploadedImageOrigin: 'manual' | 'generated' | null;
  storyboardRunId: string | null;
  storyboardArtifactId: string | null;
  storyboardAssetId: string | null;
  selectedSceneBackgroundId: string | null;
  selectedVideoModel: string | null;
  prompt: string;
  dreamRunId: string;
  dreamVideoArtifactId: string | null;
  step: 3;
};

export function createWorkflowVideoModelState(
  models: SelectableModel[],
  priorModelId: string | null,
): {
  selectedModelId: string | null;
  hasModels: boolean;
} {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return {
      selectedModelId: priorModelId,
      hasModels: true,
    };
  }

  return {
    selectedModelId: models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null,
    hasModels: models.length > 0,
  };
}

export function resolveWorkflowVideoModelAvailability(
  config: WorkflowVideoConfigSnapshot,
  priorModelId: string | null,
) {
  const modelState = createWorkflowVideoModelState(config.models, priorModelId);

  if (!config.enabled) {
    return {
      selectedModelId: modelState.selectedModelId,
      status: 'maintenance' as const,
      message:
        config.message ??
        (config.upgradeRequired
          ? 'AI 视频生成是会员权益，开通会员后即可使用。'
          : '视频生成暂未开放，请稍后再试。'),
    };
  }

  if (!modelState.hasModels) {
    return {
      selectedModelId: modelState.selectedModelId,
      status: 'maintenance' as const,
      message: buildUnavailableModelMessage(),
    };
  }

  return {
    selectedModelId: modelState.selectedModelId,
    status: 'ready' as const,
    message: null,
  };
}

export function resetWorkflowForImageSourceChange(_snapshot: WorkflowStateSnapshot) {
  return {
    step: 0,
    storyboardGenerated: false,
    storyboardGenerating: false,
    selectedScene: null,
    customSceneUrl: null,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: false,
  };
}

export function resetWorkflowForSceneChange(snapshot: WorkflowStateSnapshot) {
  return {
    step: snapshot.step >= 3 ? 2 : snapshot.step,
    dreaming: false,
  };
}

export function applyGeneratedWorkflowImage(
  snapshot: WorkflowStateSnapshot,
  imageUrl: string,
  hasManualUpload: boolean,
) {
  return {
    imageUrl,
    hasManualUpload,
    resetState: {
      step: snapshot.step,
      storyboardGenerated: false,
      storyboardGenerating: false,
      selectedScene: null,
      customSceneUrl: null,
      aiSceneGenerated: false,
      aiSceneGenerating: false,
      dreaming: false,
    },
  };
}

export function resolveWorkflowVideoMaterialReadiness(input: {
  hasSourceImageAsset: boolean;
  hasSourceImageFile: boolean;
  hasStoryboardAsset: boolean;
  hasStoryboardRunArtifact: boolean;
  hasSelectedConfiguredBackground: boolean;
}) {
  if (!input.hasSourceImageAsset && !input.hasSourceImageFile) {
    return {
      ready: false,
      message: '请上传本地原图后再生成视频。',
    };
  }

  if (!input.hasStoryboardAsset && !input.hasStoryboardRunArtifact) {
    return {
      ready: false,
      message: '请先生成12宫格分镜图。',
    };
  }

  if (!input.hasSelectedConfiguredBackground) {
    return {
      ready: false,
      message: '请先选择官网背景图后再生成视频。',
    };
  }

  return {
    ready: true,
    message: null,
  };
}

export function resolveWorkflowUploadStepNextAction(input: {
  storyboardAssetId: string | null;
  storyboardRunId: string | null;
  storyboardArtifactId: string | null;
}): 'generate_storyboard' | 'view_storyboard' {
  return input.storyboardAssetId || (input.storyboardRunId && input.storyboardArtifactId)
    ? 'view_storyboard'
    : 'generate_storyboard';
}

export function resolveWorkflowSceneStepDreamAction(input: {
  dreamRunId: string | null;
  hasDreamVideo: boolean;
}): {
  label: string;
  description: string | null;
  viewHistoryVideoLabel: string | null;
} {
  return input.dreamRunId
    ? {
        label: '重新生成视频',
        description: '将基于当前图案、分镜、场景和提示词新建一个视频任务，原历史记录不会被覆盖。',
        viewHistoryVideoLabel: input.hasDreamVideo ? '下一步：查看历史视频' : null,
      }
    : {
        label: '开始造梦',
        description: null,
        viewHistoryVideoLabel: null,
      };
}

export function shouldContinueWorkflowVideoSync(status: string) {
  return status === 'queued' || status === 'running';
}

export function isWorkflowVideoHistoryRun(input: {
  taskType: AgentTaskType;
  input?: Record<string, unknown> | null;
}) {
  return input.taskType === 'workflow' && input.input?.stage === 'workflow_video';
}

export function createWorkflowVideoRestoreSnapshot(
  detail: AgentRunDetailDto,
): WorkflowVideoRestoreSnapshot | null {
  const input = detail.internal?.input ?? {};
  if (!isWorkflowVideoHistoryRun({ taskType: detail.run.taskType, input })) {
    return null;
  }

  const storyboardPromptMap = isRecord(input.storyboardPromptMap)
    ? input.storyboardPromptMap
    : {};
  const uploadedImageOrigin = readOrigin(storyboardPromptMap.sourceImageOrigin);
  const videoArtifact =
    detail.run.artifacts.find((artifact) => artifact.kind === 'video' && artifact.status === 'ready') ?? null;

  return {
    sourceImageAssetId: readString(input.sourceImageAssetId),
    uploadedImageOrigin,
    storyboardRunId: readString(storyboardPromptMap.storyboardRunId),
    storyboardArtifactId: readString(storyboardPromptMap.storyboardArtifactId),
    storyboardAssetId: readString(input.storyboardArtifactId),
    selectedSceneBackgroundId: readString(input.sceneBackgroundId),
    selectedVideoModel: readString(input.modelId) ?? detail.run.selectedModel?.id ?? null,
    prompt: readString(storyboardPromptMap.workflowPrompt) ?? detail.run.prompt,
    dreamRunId: detail.run.id,
    dreamVideoArtifactId: videoArtifact?.id ?? null,
    step: 3,
  };
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function readOrigin(value: unknown) {
  return value === 'manual' || value === 'generated' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampWorkflowDraftStep(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 3);
}

export function parseWorkflowDraftSnapshot(value: unknown): WorkflowDraftSnapshot | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }

  const sourceImageAssetId = readString(value.sourceImageAssetId);
  const uploadedImage = readString(value.uploadedImage);
  const hasRestorableSource = Boolean(sourceImageAssetId || uploadedImage);
  const storyboardRunId = readString(value.storyboardRunId);
  const storyboardArtifactId = readString(value.storyboardArtifactId);
  const storyboardAssetId = readString(value.storyboardAssetId);
  const hasStoryboard = Boolean(
    value.storyboardGenerated === true &&
      readString(value.storyboardImageUrl) &&
      (storyboardAssetId || (storyboardRunId && storyboardArtifactId)),
  );
  const selectedSceneBackgroundId = readString(value.selectedSceneBackgroundId);
  const hasVideoResult = Boolean(readString(value.dreamVideoUrl) && readString(value.dreamVideoArtifactId));
  let step = clampWorkflowDraftStep(value.step);

  if (!hasRestorableSource) {
    step = 0;
  } else if (step > 1 && !hasStoryboard) {
    step = 1;
  } else if (step > 2 && !selectedSceneBackgroundId && !hasVideoResult) {
    step = 2;
  }

  return {
    version: 1,
    step,
    uploadedImage,
    uploadedImageOrigin: readOrigin(value.uploadedImageOrigin),
    sourceImageAssetId,
    selectedImageModel: readString(value.selectedImageModel),
    storyboardGenerated: hasStoryboard,
    storyboardImageUrl: hasStoryboard ? readString(value.storyboardImageUrl) : null,
    storyboardRunId,
    storyboardArtifactId,
    storyboardAssetId,
    selectedSceneBackgroundId,
    prompt: readString(value.prompt) ?? '',
    selectedVideoModel: readString(value.selectedVideoModel),
    dreamRunId: readString(value.dreamRunId),
    dreamVideoUrl: readString(value.dreamVideoUrl),
    dreamVideoArtifactId: readString(value.dreamVideoArtifactId),
    updatedAt: readString(value.updatedAt) ?? '',
  };
}
