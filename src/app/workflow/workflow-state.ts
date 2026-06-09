import { buildUnavailableModelMessage } from '@/features/public/model-availability';

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
