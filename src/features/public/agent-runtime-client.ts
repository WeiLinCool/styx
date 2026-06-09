import type {
  AgentConversationDto,
  AgentConversationFolderDto,
  AgentConversationListDto,
  AgentRunDetailDto,
  AgentRunDto,
  AgentTaskType,
  CreateAgentRunResult,
  DirectMediaResultDto,
  GeneratedMediaAssetDto,
} from '@/server/agent/types';
import { userApiRequest } from '@/lib/user-api-client';

export type ChatModelOption = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
};

export type ImageModelMode = 'generate' | 'edit' | 'upscale';

export type ImageModelOption = ChatModelOption & {
  supportedModes: ImageModelMode[];
  supportsWorkflowStoryboardTemplate: boolean;
};

export type VideoModelOption = ChatModelOption;

export type VideoStylePresetOption = {
  id: string;
  code: string;
  name: string;
  prompt: string;
};

export type VideoResolutionOption = {
  value: string;
  label: string;
};

export type WorkflowSceneBackgroundOption = {
  id: string;
  name: string;
  styleName: string;
  publicUrl: string;
};

export type VideoGenerationConfigDto = {
  enabled: boolean;
  upgradeRequired: boolean;
  message: string | null;
  styles: VideoStylePresetOption[];
  durations: number[];
  resolutions: VideoResolutionOption[];
  defaults: {
    styleCode: string | null;
    durationSeconds: number | null;
    resolution: string | null;
  };
  models: VideoModelOption[];
  workflowSceneBackgrounds: WorkflowSceneBackgroundOption[];
};

export type AgentRuntimeApiErrorCode =
  | 'invalid_request'
  | 'model_required'
  | 'model_not_available'
  | 'model_entitlement_required'
  | 'insufficient_credits'
  | 'provider_unconfigured'
  | 'provider_error'
  | 'account_inactive'
  | 'unauthorized'
  | 'forbidden'
  | 'internal_error'
  | (string & {});

export class AgentRuntimeApiError extends Error {
  readonly code: AgentRuntimeApiErrorCode;
  readonly status: number;

  constructor(input: { code: AgentRuntimeApiErrorCode; message: string; status: number }) {
    super(input.message);
    this.name = 'AgentRuntimeApiError';
    this.code = input.code;
    this.status = input.status;
  }
}

export function readMediaSaveErrorMessage(error: unknown, fallbackMessage = '保存媒体失败') {
  if (error instanceof AgentRuntimeApiError) {
    if (
      error.message.includes('缓存对象缺失，已回退到源文件，但重新保存失败：') ||
      error.message.startsWith('cache_missing_fallback_failed:')
    ) {
      const detail = error.message
        .replace('cache_missing_fallback_failed:', '')
        .replace('缓存对象缺失，已回退到源文件，但重新保存失败：', '')
        .trim();
      return detail
        ? `缓存对象已失效，已自动改用源文件重试，但保存仍失败：${detail}`
        : '缓存对象已失效，已自动改用源文件重试，但保存仍失败。';
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message.includes('缓存对象缺失，已回退到源文件，但重新保存失败：') ||
      message.startsWith('cache_missing_fallback_failed:')
    ) {
      const detail = message
        .replace('cache_missing_fallback_failed:', '')
        .replace('缓存对象缺失，已回退到源文件，但重新保存失败：', '')
        .trim();
      return detail
        ? `缓存对象已失效，已自动改用源文件重试，但保存仍失败：${detail}`
        : '缓存对象已失效，已自动改用源文件重试，但保存仍失败。';
    }
    return message;
  }

  return fallbackMessage;
}

export function isStorageQuotaExceededSaveError(error: unknown) {
  if (error instanceof AgentRuntimeApiError) {
    return (
      error.code === 'storage_quota_exceeded' ||
      error.message === '存储空间不足，无法保存到我的媒体。' ||
      error.message === 'storage_quota_exceeded' ||
      error.message.includes('存储空间不足，无法保存到我的媒体。')
    );
  }

  if (error instanceof Error) {
    return (
      error.message === '存储空间不足，无法保存到我的媒体。' ||
      error.message === 'storage_quota_exceeded' ||
      error.message.includes('存储空间不足，无法保存到我的媒体。')
    );
  }

  return false;
}

function isCacheFallbackSaveFailure(metadata: Record<string, unknown>) {
  return (
    metadata.saveStatus === 'save_failed' &&
    typeof metadata.saveError === 'string' &&
    metadata.saveError.startsWith('cache_missing_fallback_failed:')
  );
}

export function formatMediaSaveStatus(metadata: Record<string, unknown>) {
  if (metadata.saveStatus === 'saved') return '已存储';
  if (metadata.saveStatus === 'saving') return '存储中';
  if (metadata.saveStatus === 'source_expired') return '已过期';
  if (isCacheFallbackSaveFailure(metadata)) return '回退重试失败';
  if (metadata.saveStatus === 'save_failed') return '存储失败';
  return '未存储';
}

export function formatMediaSaveActionLabel(metadata: Record<string, unknown>) {
  if (metadata.saveStatus === 'saved') return '已保存到我的媒体';
  if (metadata.saveStatus === 'saving') return '保存中...';
  if (isCacheFallbackSaveFailure(metadata)) return '重试保存';
  if (metadata.saveStatus === 'save_failed') return '重新保存';
  if (metadata.saveStatus === 'source_expired') return '已过期';
  return '保存到我的媒体';
}

export type CreateAgentRunRequest = {
  taskType: AgentTaskType;
  prompt: string;
  modelId?: string;
  conversationId?: string;
  input?: Record<string, unknown>;
};

export type ListAgentRunsInput = {
  taskType?: Extract<AgentTaskType, 'image' | 'video'>;
};

export type GeneratedRunArtifactAccess = {
  runId: string;
  artifactId: string;
  savedAssetId?: string;
  url: string;
  expiresAt: string;
  mimeType: string | null;
  disposition: 'preview' | 'download';
};

export type UpdateAgentConversationRequest = {
  titleOverride?: string | null;
  folderId?: string | null;
};

type ErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

function apiErrorFromPayload(payload: unknown, status: number, fallbackMessage: string): AgentRuntimeApiError {
  const error = (payload && typeof payload === 'object' ? (payload as ErrorPayload).error : null) ?? null;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' ? error.message : fallbackMessage;

  return new AgentRuntimeApiError({ code, message, status });
}

function parseChatModel(value: unknown): ChatModelOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const model = value as Record<string, unknown>;
  if (
    typeof model.id !== 'string' ||
    typeof model.code !== 'string' ||
    typeof model.name !== 'string' ||
    typeof model.providerName !== 'string' ||
    typeof model.isDefault !== 'boolean' ||
    typeof model.entitlementLabel !== 'string' ||
    typeof model.pricingSummary !== 'string'
  ) {
    return null;
  }

  return {
    id: model.id,
    code: model.code,
    name: model.name,
    providerName: model.providerName,
    isDefault: model.isDefault,
    entitlementLabel: model.entitlementLabel,
    pricingSummary: model.pricingSummary,
  };
}

function isImageModelMode(value: unknown): value is ImageModelMode {
  return value === 'generate' || value === 'edit' || value === 'upscale';
}

export function parseImageModel(value: unknown): ImageModelOption | null {
  const model = parseChatModel(value);
  if (!model || !value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const supportedModes = payload.supportedModes;
  if (
    !Array.isArray(supportedModes) ||
    supportedModes.length === 0 ||
    !supportedModes.every(isImageModelMode)
  ) {
    return null;
  }

  return {
    ...model,
    supportedModes,
    supportsWorkflowStoryboardTemplate: payload.supportsWorkflowStoryboardTemplate === true,
  };
}

export function parseVideoModel(value: unknown): VideoModelOption | null {
  return parseChatModel(value);
}

function parseVideoStylePreset(value: unknown): VideoStylePresetOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const style = value as Record<string, unknown>;
  if (
    typeof style.id !== 'string' ||
    typeof style.code !== 'string' ||
    typeof style.name !== 'string' ||
    typeof style.prompt !== 'string' ||
    style.id.trim().length === 0 ||
    style.code.trim().length === 0 ||
    style.name.trim().length === 0 ||
    style.prompt.trim().length === 0
  ) {
    return null;
  }

  return {
    id: style.id,
    code: style.code,
    name: style.name,
    prompt: style.prompt,
  };
}

function parseVideoResolution(value: unknown): VideoResolutionOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const resolution = value as Record<string, unknown>;
  if (
    typeof resolution.value !== 'string' ||
    typeof resolution.label !== 'string' ||
    resolution.value.trim().length === 0 ||
    resolution.label.trim().length === 0
  ) {
    return null;
  }

  return {
    value: resolution.value,
    label: resolution.label,
  };
}

function parseVideoConfigDefaults(value: unknown): VideoGenerationConfigDto['defaults'] {
  if (!value || typeof value !== 'object') {
    return {
      styleCode: null,
      durationSeconds: null,
      resolution: null,
    };
  }

  const defaults = value as Record<string, unknown>;
  return {
    styleCode: typeof defaults.styleCode === 'string' ? defaults.styleCode : null,
    durationSeconds:
      typeof defaults.durationSeconds === 'number' &&
      Number.isInteger(defaults.durationSeconds) &&
      defaults.durationSeconds > 0
        ? defaults.durationSeconds
        : null,
    resolution: typeof defaults.resolution === 'string' ? defaults.resolution : null,
  };
}

function parseWorkflowSceneBackground(value: unknown): WorkflowSceneBackgroundOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const background = value as Record<string, unknown>;
  if (
    typeof background.id !== 'string' ||
    typeof background.name !== 'string' ||
    typeof background.styleName !== 'string' ||
    typeof background.publicUrl !== 'string' ||
    background.id.trim().length === 0 ||
    background.name.trim().length === 0 ||
    background.styleName.trim().length === 0 ||
    !background.publicUrl.startsWith('/workflow-backgrounds/')
  ) {
    return null;
  }

  return {
    id: background.id,
    name: background.name,
    styleName: background.styleName,
    publicUrl: background.publicUrl,
  };
}

export function parseVideoGenerationConfig(value: unknown): VideoGenerationConfigDto {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const enabled = payload.enabled === true;
  const upgradeRequired = payload.upgradeRequired === true;
  const message = typeof payload.message === 'string' ? payload.message : null;

  if (!enabled) {
    return {
      enabled: false,
      upgradeRequired,
      message,
      styles: [],
      durations: [],
      resolutions: [],
      defaults: {
        styleCode: null,
        durationSeconds: null,
        resolution: null,
      },
      models: [],
      workflowSceneBackgrounds: [],
    };
  }

  const rawStyles = Array.isArray(payload.styles) ? payload.styles : [];
  const rawDurations = Array.isArray(payload.durations) ? payload.durations : [];
  const rawResolutions = Array.isArray(payload.resolutions) ? payload.resolutions : [];
  const rawModels = Array.isArray(payload.models) ? payload.models : [];
  const rawWorkflowSceneBackgrounds = Array.isArray(payload.workflowSceneBackgrounds)
    ? payload.workflowSceneBackgrounds
    : [];

  return {
    enabled,
    upgradeRequired,
    message,
    styles: rawStyles
      .map(parseVideoStylePreset)
      .filter((style): style is VideoStylePresetOption => style !== null),
    durations: rawDurations.filter(
      (duration): duration is number =>
        typeof duration === 'number' && Number.isInteger(duration) && duration > 0,
    ),
    resolutions: rawResolutions
      .map(parseVideoResolution)
      .filter((resolution): resolution is VideoResolutionOption => resolution !== null),
    defaults: parseVideoConfigDefaults(payload.defaults),
    models: rawModels.map(parseVideoModel).filter((model): model is VideoModelOption => model !== null),
    workflowSceneBackgrounds: rawWorkflowSceneBackgrounds
      .map(parseWorkflowSceneBackground)
      .filter((background): background is WorkflowSceneBackgroundOption => background !== null),
  };
}

export function selectChatModelId(models: ChatModelOption[], priorModelId?: string | null): string | null {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return priorModelId;
  }

  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export function selectImageModelId(
  models: ImageModelOption[],
  priorModelId?: string | null,
): string | null {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return priorModelId;
  }

  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export function filterStoryboardTemplateImageModels(models: ImageModelOption[]) {
  return models.filter(
    (model) =>
      model.supportsWorkflowStoryboardTemplate &&
      model.supportedModes.includes('generate'),
  );
}

export async function listChatModels(): Promise<ChatModelOption[]> {
  const response = await userApiRequest('/api/agent/chat-models', { cache: 'no-store' });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '模型列表加载失败');
  }

  const rawModels =
    payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : [];

  return rawModels.map(parseChatModel).filter((model): model is ChatModelOption => model !== null);
}

export async function listImageModels(mode: ImageModelMode): Promise<ImageModelOption[]> {
  const response = await userApiRequest(`/api/agent/image-models?mode=${encodeURIComponent(mode)}`, {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '图片模型列表加载失败');
  }

  const rawModels =
    payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : [];

  return rawModels.map(parseImageModel).filter((model): model is ImageModelOption => model !== null);
}

export async function listVideoModels(): Promise<VideoModelOption[]> {
  const response = await userApiRequest('/api/agent/video-models', { cache: 'no-store' });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '视频模型列表加载失败');
  }

  const rawModels =
    payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : [];

  return rawModels.map(parseVideoModel).filter((model): model is VideoModelOption => model !== null);
}

export async function getVideoGenerationConfig(): Promise<VideoGenerationConfigDto> {
  const response = await userApiRequest('/api/agent/video-config', { cache: 'no-store' });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '视频生成配置加载失败');
  }

  return parseVideoGenerationConfig(payload);
}

function parseConversationFolder(value: unknown): AgentConversationFolderDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const folder = value as Record<string, unknown>;
  if (
    typeof folder.id !== 'string' ||
    typeof folder.name !== 'string' ||
    typeof folder.sortOrder !== 'number' ||
    typeof folder.createdAt !== 'string' ||
    typeof folder.updatedAt !== 'string'
  ) {
    return null;
  }
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

function parseConversation(value: unknown): AgentConversationDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const conversation = value as Record<string, unknown>;
  if (
    typeof conversation.id !== 'string' ||
    (conversation.folderId !== null && typeof conversation.folderId !== 'string') ||
    typeof conversation.title !== 'string' ||
    typeof conversation.autoTitle !== 'string' ||
    (conversation.titleOverride !== null && typeof conversation.titleOverride !== 'string') ||
    typeof conversation.lastRunAt !== 'string' ||
    typeof conversation.createdAt !== 'string' ||
    typeof conversation.updatedAt !== 'string'
  ) {
    return null;
  }
  return {
    id: conversation.id,
    folderId: conversation.folderId,
    title: conversation.title,
    autoTitle: conversation.autoTitle,
    titleOverride: conversation.titleOverride,
    lastRunAt: conversation.lastRunAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export async function listAgentConversations(): Promise<AgentConversationListDto> {
  const response = await userApiRequest('/api/agent/conversations', {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '对话历史加载失败');
  }

  const rawFolders =
    payload && typeof payload === 'object' && Array.isArray((payload as { folders?: unknown }).folders)
      ? (payload as { folders: unknown[] }).folders
      : [];
  const rawConversations =
    payload && typeof payload === 'object' && Array.isArray((payload as { conversations?: unknown }).conversations)
      ? (payload as { conversations: unknown[] }).conversations
      : [];

  return {
    folders: rawFolders.map(parseConversationFolder).filter((folder): folder is AgentConversationFolderDto => folder !== null),
    conversations: rawConversations.map(parseConversation).filter((conversation): conversation is AgentConversationDto => conversation !== null),
  };
}

export async function createConversationFolder(name: string): Promise<AgentConversationFolderDto> {
  const response = await userApiRequest('/api/agent/conversation-folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '文件夹创建失败');
  }

  return payload.folder;
}

export async function updateConversationFolder(
  folderId: string,
  name: string,
): Promise<AgentConversationFolderDto> {
  const response = await userApiRequest(`/api/agent/conversation-folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '文件夹更新失败');
  }

  return payload.folder;
}

export async function deleteConversationFolder(folderId: string): Promise<AgentConversationFolderDto> {
  const response = await userApiRequest(`/api/agent/conversation-folders/${folderId}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '文件夹删除失败');
  }

  return payload.folder;
}

export async function updateAgentConversation(
  conversationId: string,
  input: UpdateAgentConversationRequest,
): Promise<AgentConversationDto> {
  const response = await userApiRequest(`/api/agent/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '对话更新失败');
  }

  return payload.conversation;
}

export async function createAgentRun(input: CreateAgentRunRequest): Promise<CreateAgentRunResult> {
  const response = await userApiRequest('/api/agent/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, 'AI 请求失败');
  }

  return {
    run: payload.run,
    transientArtifacts: Array.isArray(payload.transientArtifacts) ? payload.transientArtifacts : [],
  };
}

export async function listAgentRuns(input: ListAgentRunsInput = {}): Promise<AgentRunDto[]> {
  const query = input.taskType ? `?taskType=${encodeURIComponent(input.taskType)}` : '';
  const response = await userApiRequest(`/api/agent/runs${query}`, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '历史记录加载失败');
  }

  return payload.runs ?? [];
}

export async function getAgentRunDetail(runId: string): Promise<AgentRunDetailDto> {
  const response = await userApiRequest(`/api/agent/runs/${runId}`, {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '对话加载失败');
  }

  return payload;
}

export async function syncAgentRun(runId: string): Promise<AgentRunDto> {
  const response = await userApiRequest(`/api/agent/runs/${runId}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '任务同步失败');
  }

  return payload.run;
}

export async function saveGeneratedMedia(input: {
  runId: string;
  artifactId: string;
}): Promise<{ asset: GeneratedMediaAssetDto; artifact: AgentRunDetailDto['run']['artifacts'][number] }> {
  const response = await userApiRequest('/api/user/media-assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '保存媒体失败');
  }

  return payload;
}

export async function getGeneratedRunArtifactAccess(
  runId: string,
  artifactId: string,
  disposition: 'preview' | 'download' = 'preview',
): Promise<GeneratedRunArtifactAccess> {
  const response = await userApiRequest(
    `/api/agent/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(
      artifactId,
    )}/access?disposition=${encodeURIComponent(disposition)}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '生成结果访问失败');
  }

  return payload.access;
}

export async function listSavedMediaAssets(): Promise<GeneratedMediaAssetDto[]> {
  const response = await userApiRequest('/api/user/media-assets', {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '媒体库加载失败');
  }

  return Array.isArray(payload?.assets) ? payload.assets : [];
}

export async function uploadUserMedia(input: {
  file: File;
  title?: string;
}): Promise<GeneratedMediaAssetDto> {
  const formData = new FormData();
  formData.set('file', input.file);
  if (input.title?.trim()) {
    formData.set('title', input.title.trim());
  }

  const response = await userApiRequest('/api/user/media-assets/upload', {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '资料上传失败');
  }

  return payload.asset;
}

export async function enableMediaShare(assetId: string): Promise<{
  asset: GeneratedMediaAssetDto;
  share: { shareId: string; url: string };
}> {
  const response = await userApiRequest(`/api/user/media-assets/${assetId}/share`, {
    method: 'POST',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '开启分享失败');
  }

  return payload;
}

export async function disableMediaShare(assetId: string): Promise<GeneratedMediaAssetDto> {
  const response = await userApiRequest(`/api/user/media-assets/${assetId}/share`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '关闭分享失败');
  }

  return payload.asset;
}

export async function renameSavedMediaAsset(
  assetId: string,
  title: string,
): Promise<GeneratedMediaAssetDto> {
  const response = await userApiRequest(`/api/user/media-assets/${assetId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '资料重命名失败');
  }

  return payload.asset;
}

export async function getPublicSharedMedia(shareId: string): Promise<{
  asset: {
    id: string;
    title: string;
    kind: 'image' | 'audio' | 'video';
    mimeType: string | null;
    byteSize: number;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
    shareId: string | null;
    shareStatus: 'active' | 'disabled';
  };
  access: {
    url: string;
    expiresAt: string;
  };
}> {
  const response = await fetch(`/api/public/media-share/${shareId}`, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '分享资料加载失败');
  }

  return payload;
}

export async function getSavedMediaAssetAccess(
  assetId: string,
  disposition: 'preview' | 'download',
): Promise<{
  assetId: string;
  disposition: 'preview' | 'download';
  url: string;
  expiresAt: string;
  mimeType: string | null;
}> {
  const response = await userApiRequest(
    `/api/user/media-assets/${assetId}/access?disposition=${disposition}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '资料访问失败');
  }

  return payload.access;
}

export async function deleteAgentRun(runId: string): Promise<AgentRunDto> {
  const response = await userApiRequest(`/api/agent/runs/${runId}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '历史记录删除失败');
  }

  return payload.run;
}

export function createAgentRunEventsUrl(runId: string) {
  return `/api/agent/runs/${runId}/events`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const DIRECT_MEDIA_TYPED_METADATA_KEYS = new Set([
  'mimeType',
  'filename',
  'width',
  'height',
  'durationSeconds',
  'providerTaskId',
  'model',
  'storageStatus',
  'cacheStatus',
  'cacheProvider',
  'cacheBucket',
  'cacheRegion',
  'cacheObjectKey',
  'cacheExpiresAt',
]);

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readDirectMediaStorageStatus(
  metadata: Record<string, unknown>,
): DirectMediaResultDto['metadata']['storageStatus'] | null {
  const value = metadata.storageStatus;
  if (value === 'provider_direct' || value === 'cached' || value === 'stored') {
    return value;
  }
  return null;
}

function sanitizeDirectMediaMetadata(metadata: Record<string, unknown>): DirectMediaResultDto['metadata'] {
  const unknownMetadata: Record<string, unknown> = {};
  for (const [key, metadataValue] of Object.entries(metadata)) {
    if (!DIRECT_MEDIA_TYPED_METADATA_KEYS.has(key)) {
      unknownMetadata[key] = metadataValue;
    }
  }

  const mimeType = readMetadataString(metadata, 'mimeType');
  const filename = readMetadataString(metadata, 'filename');
  const width = readMetadataNumber(metadata, 'width');
  const height = readMetadataNumber(metadata, 'height');
  const durationSeconds = readMetadataNumber(metadata, 'durationSeconds');
  const providerTaskId = readMetadataString(metadata, 'providerTaskId');
  const model = readMetadataString(metadata, 'model');
  const storageStatus = readDirectMediaStorageStatus(metadata);

  return {
    ...unknownMetadata,
    storageStatus: storageStatus ?? 'provider_direct',
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(providerTaskId !== undefined ? { providerTaskId } : {}),
    ...(model !== undefined ? { model } : {}),
  };
}

export function parseStreamEventPayload(event: Pick<MessageEvent, 'data'>): Record<string, unknown> | null {
  if (typeof event.data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(event.data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseDirectMediaArtifactPayload(value: unknown): DirectMediaResultDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const payload = isRecord(value.payload) ? value.payload : value;
  const artifact = isRecord(payload.artifact) ? payload.artifact : payload;
  if (!artifact) {
    return null;
  }

  const delivery = isRecord(artifact.delivery) ? artifact.delivery : null;
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : null;
  const expiresAt = typeof delivery?.expiresAt === 'string' ? delivery.expiresAt : null;
  if (
    (artifact.kind !== 'image' && artifact.kind !== 'video') ||
    typeof artifact.title !== 'string' ||
    !delivery ||
    (delivery.mode !== 'provider_url' && delivery.mode !== 'data_url') ||
    typeof delivery.url !== 'string' ||
    !metadata ||
    !readDirectMediaStorageStatus(metadata)
  ) {
    return null;
  }

  return {
    kind: artifact.kind,
    title: artifact.title,
    delivery: {
      mode: delivery.mode,
      url: delivery.url,
      expiresAt,
    },
    metadata: sanitizeDirectMediaMetadata(metadata),
  };
}
