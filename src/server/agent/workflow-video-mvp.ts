const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WorkflowVideoMvpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowVideoMvpValidationError';
  }
}

export type WorkflowVideoMvpInput = {
  sourceImageAssetId: string;
  storyboardArtifactId: string;
  sceneBackgroundAssetId: string;
  storyboardPromptMap: Record<string, unknown>;
  durationSeconds?: number;
  resolution?: string;
};

export type WorkflowVideoMvpPromptValues = {
  workflow_prompt: string;
  source_image_url: string;
  storyboard_image_url: string;
  scene_background_url: string;
  storyboard_prompt_map: string;
  duration_seconds: string;
  resolution: string;
};

function readUuid(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new WorkflowVideoMvpValidationError(`workflow video input.${key} is required.`);
  }
  return value;
}

export function parseWorkflowVideoMvpInput(input: Record<string, unknown>): WorkflowVideoMvpInput {
  const storyboardPromptMap = input.storyboardPromptMap;
  if (!storyboardPromptMap || typeof storyboardPromptMap !== 'object' || Array.isArray(storyboardPromptMap)) {
    throw new WorkflowVideoMvpValidationError('workflow video input.storyboardPromptMap is required.');
  }

  const durationSeconds =
    typeof input.durationSeconds === 'number' && Number.isInteger(input.durationSeconds)
      ? input.durationSeconds
      : undefined;
  const resolution =
    typeof input.resolution === 'string' && input.resolution.trim()
      ? input.resolution.trim()
      : undefined;

  return {
    sourceImageAssetId: readUuid(input, 'sourceImageAssetId'),
    storyboardArtifactId: readUuid(input, 'storyboardArtifactId'),
    sceneBackgroundAssetId: readUuid(input, 'sceneBackgroundAssetId'),
    storyboardPromptMap: storyboardPromptMap as Record<string, unknown>,
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(resolution ? { resolution } : {}),
  };
}

export function renderWorkflowVideoMvpPrompt(input: {
  template: string;
  values: WorkflowVideoMvpPromptValues;
}) {
  return input.template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    return Object.hasOwn(input.values, key)
      ? input.values[key as keyof WorkflowVideoMvpPromptValues]
      : match;
  });
}
