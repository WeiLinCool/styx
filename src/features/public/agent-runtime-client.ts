import type {
  AgentRunDetailDto,
  AgentRunDto,
  AgentTaskType,
  CreateAgentRunResult,
  DirectMediaResultDto,
} from '@/server/agent/types';

export type ChatModelOption = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
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

export type CreateAgentRunRequest = {
  taskType: AgentTaskType;
  prompt: string;
  modelId?: string;
  conversationId?: string;
  input?: Record<string, unknown>;
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

export function selectChatModelId(models: ChatModelOption[], priorModelId?: string | null): string | null {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return priorModelId;
  }

  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export async function listChatModels(): Promise<ChatModelOption[]> {
  const response = await fetch('/api/agent/chat-models', { cache: 'no-store' });
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

export async function createAgentRun(input: CreateAgentRunRequest): Promise<CreateAgentRunResult> {
  const response = await fetch('/api/agent/runs', {
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

export async function listAgentRuns(): Promise<AgentRunDto[]> {
  const response = await fetch('/api/agent/runs', {
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
  const response = await fetch(`/api/agent/runs/${runId}`, {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '对话加载失败');
  }

  return payload;
}

export async function deleteAgentRun(runId: string): Promise<AgentRunDto> {
  const response = await fetch(`/api/agent/runs/${runId}`, {
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
]);

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

  return {
    ...unknownMetadata,
    storageStatus: 'provider_direct',
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
    metadata.storageStatus !== 'provider_direct'
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
