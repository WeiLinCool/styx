import type { WorkflowStoryboardCapabilityConfig } from './types';

type WorkflowStoryboardPromptInput = {
  capabilityConfig: WorkflowStoryboardCapabilityConfig;
  workflowPrompt: string;
  sourceImageOrigin?: string | null;
  selectedImageModelId?: string | null;
  executionSize?: string | null;
};

export const WORKFLOW_STORYBOARD_IMAGE_MODE = 'edit';
const WORKFLOW_STORYBOARD_DOUBAO_EXECUTION_SIZE = '2K';

function normalizePromptText(value: string) {
  return value.trim();
}

function normalizeSourceImageOrigin(value: string | null | undefined) {
  if (value === 'manual' || value === 'generated') {
    return value;
  }

  return 'manual';
}

function normalizeSelectedImageModelId(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function formatWorkflowStoryboardCanonicalSize(
  config: Pick<WorkflowStoryboardCapabilityConfig, 'layout'>,
) {
  return `${config.layout.width}x${config.layout.height}`;
}

export function buildWorkflowStoryboardPrompt(input: WorkflowStoryboardPromptInput) {
  const workflowPrompt = normalizePromptText(input.workflowPrompt);
  const sourceImageOrigin = normalizeSourceImageOrigin(input.sourceImageOrigin);
  const selectedImageModelId = normalizeSelectedImageModelId(input.selectedImageModelId);

  return renderStoryboardPromptTemplate(input.capabilityConfig.promptText, {
    workflow_prompt: workflowPrompt,
    source_image_origin: sourceImageOrigin,
    selected_image_model_id: selectedImageModelId ?? '',
    template_width: String(input.capabilityConfig.layout.width),
    template_height: String(input.capabilityConfig.layout.height),
    template_columns: String(input.capabilityConfig.layout.columns),
    template_rows: String(input.capabilityConfig.layout.rows),
    execution_size:
      typeof input.executionSize === 'string' && input.executionSize.trim().length > 0
        ? input.executionSize.trim()
        : formatWorkflowStoryboardCanonicalSize(input.capabilityConfig),
  });
}

export function renderStoryboardPromptTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key) => {
    const normalizedKey = String(key).toLowerCase();
    return Object.hasOwn(values, normalizedKey) ? values[normalizedKey] ?? '' : match;
  });
}

export function resolveWorkflowStoryboardExecutionSize(
  input: {
    providerCode?: string | null;
    providerName?: string | null;
    baseUrl?: string | null;
    model?: string | null;
  },
  canonicalSize: string,
) {
  if (!isDoubaoLikeProvider(input)) {
    return canonicalSize;
  }

  return WORKFLOW_STORYBOARD_DOUBAO_EXECUTION_SIZE;
}

function isDoubaoLikeProvider(input: {
  providerCode?: string | null;
  providerName?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}) {
  const providerCode = input.providerCode?.trim().toLowerCase() ?? '';
  const providerName = input.providerName?.trim().toLowerCase() ?? '';
  const baseUrl = input.baseUrl?.trim().toLowerCase() ?? '';
  const model = input.model?.trim().toLowerCase() ?? '';

  return (
    providerCode === 'doubao' ||
    providerCode === 'ark' ||
    providerCode === 'byteplus' ||
    providerName.includes('doubao') ||
    providerName.includes('byteplus') ||
    baseUrl.includes('volces.com') ||
    baseUrl.includes('bytepluses.com') ||
    model.includes('seedream') ||
    model.includes('seededit')
  );
}

export function sanitizeWorkflowStoryboardRunInput(input: Record<string, unknown>) {
  const {
    sourceImageDataUrl: _sourceImageDataUrl,
    additionalImageDataUrls: _additionalImageDataUrls,
    ...durableInput
  } = structuredClone(input) as Record<string, unknown>;

  return durableInput;
}

export function normalizeWorkflowStoryboardSourceImageOrigin(value: unknown) {
  return value === 'manual' || value === 'generated' ? value : 'manual';
}
