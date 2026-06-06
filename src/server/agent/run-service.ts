import {
  calculateChatCreditCost,
  calculateImageCreditCost,
  assertCanAffordMinimum as defaultAssertCanAffordMinimum,
  debitForAgentRun as defaultDebitForAgentRun,
  debitForImageAgentRun as defaultDebitForImageAgentRun,
} from '@/server/billing/credits';
import {
  calculateProviderCreditCost,
  normalizeProviderUsage,
} from '@/server/billing/provider-rules';
import {
  createChatProviderAdapter as defaultCreateChatProviderAdapter,
  ProviderConfigurationError,
  type ChatProviderResult,
  type ChatProviderAdapter,
} from '@/server/ai/provider-adapters';
import {
  createDoubaoImageProviderAdapter as defaultCreateImageProviderAdapter,
  type ImageProviderAdapter,
  type ImageProviderResult,
} from '@/server/ai/image-provider-adapters';
import {
  createMediaProviderAdapter,
  type MediaProviderAdapter,
} from '@/server/ai/media-provider-adapters';
import { listActiveUserEntitlements, type ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import { createTencentCosClient } from '@/server/media/cos-client';
import {
  createDatabaseGeneratedMediaAssetRepository,
  type GeneratedMediaAssetRepository,
} from '@/server/repositories/generated-media-assets';
import { resolveDefaultAgentCapabilityBundle } from '@/server/repositories/agent-capabilities';
import type { AgentArtifactInput, AgentRunRepository } from '@/server/repositories/agent-runs';
import {
  getAgentConversationRepository,
  type AgentConversationRepository,
} from '@/server/repositories/agent-conversations';
import {
  resolveChatModelForUser as defaultResolveChatModelForUser,
  resolveImageModelForUser as defaultResolveImageModelForUser,
  resolveVideoModelForUser as defaultResolveVideoModelForUser,
  type ImageModelMode,
  type ResolvedChatModel,
  type ResolvedImageModel,
  type ResolvedVideoModel,
} from '@/server/repositories/ai-models';
import {
  getVideoPlanConfigByVersionId,
  listEnabledVideoStylePresets,
} from '@/server/repositories/video-generation-config';
import {
  membershipPlanVersionRepository,
  resolvePlanVersionForEntitlement,
} from '@/server/repositories/membership-plan-versions';
import {
  resolveVideoGenerationPolicy,
  validateVideoGenerationSelection,
  type VideoGenerationPolicy,
} from '@/server/video/video-generation-policy';
import type {
  AgentCapabilitySnapshot,
  AgentRunDto,
  AgentTaskType,
  AiUsage,
  CreateAgentRunResult,
  DirectMediaArtifactCompletedPayload,
  GeneratedMediaAssetDto,
  TransientAgentArtifactDto,
} from './types';
import {
  createUnconfiguredCapabilitySnapshot,
  type PiAgentRuntime,
} from './pi-runtime';
import {
  createDirectMediaEventPayload,
  sanitizeDirectMediaArtifact,
  toDirectMediaResult,
} from './media-results';

export class AgentCapabilityBundleNotFoundError extends Error {
  constructor(taskType: AgentTaskType) {
    super(`No default agent capability bundle configured for task type: ${taskType}`);
    this.name = 'AgentCapabilityBundleNotFoundError';
  }
}

export class AgentRunModelRequiredError extends Error {
  constructor() {
    super('Chat modelId is required.');
    this.name = 'AgentRunModelRequiredError';
  }
}

export class AgentRunImageSourceRequiredError extends Error {
  constructor() {
    super('source image must be a supported data URL for edit and upscale image requests.');
    this.name = 'AgentRunImageSourceRequiredError';
  }
}

export class AgentRunImageSizeInvalidError extends Error {
  constructor() {
    super("image size must be WIDTHxHEIGHT, 2k, 3k, 4k, or a supported ratio.");
    this.name = 'AgentRunImageSizeInvalidError';
  }
}

export class AgentConversationNotFoundError extends Error {
  constructor() {
    super('Agent conversation was not found.');
    this.name = 'AgentConversationNotFoundError';
  }
}

export class AgentRunVideoSelectionError extends Error {
  readonly code: 'invalid_request' | 'forbidden';

  constructor(input: { message: string; code: 'invalid_request' | 'forbidden' }) {
    super(input.message);
    this.name = 'AgentRunVideoSelectionError';
    this.code = input.code;
  }
}

export class AgentRunVideoMaterialError extends Error {
  readonly code: 'invalid_request' | 'forbidden';

  constructor(input: { message: string; code: 'invalid_request' | 'forbidden' }) {
    super(input.message);
    this.name = 'AgentRunVideoMaterialError';
    this.code = input.code;
  }
}

type DebitForAgentRun = (input: {
  userId: string;
  runId: string;
  usage: AiUsage;
  pricing: ResolvedChatModel['pricing'];
  modelSnapshot: ResolvedChatModel;
  amount: number;
}) => Promise<{ entryId: string; balanceAfter: number }>;

type DebitForImageAgentRun = (input: {
  userId: string;
  runId: string;
  pricing: ResolvedImageModel['pricing'] | ResolvedVideoModel['pricing'];
  modelSnapshot: ResolvedImageModel | ResolvedVideoModel;
  metadata: Record<string, unknown>;
  amount: number;
}) => Promise<{ entryId: string; balanceAfter: number }>;

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type MediaRunScheduler = {
  schedule(runId: string, task: () => Promise<void>): void;
  getActiveRunIds(): string[];
};

type VideoMaterialSigner = (asset: GeneratedMediaAssetDto) => Promise<string>;

export type CreateAgentRunServiceInput = {
  repository: AgentRunRepository;
  conversationRepository?: AgentConversationRepository;
  runtime: PiAgentRuntime;
  resolveChatModelForUser?: (userId: string, modelId: string) => Promise<ResolvedChatModel>;
  assertCanAffordMinimum?: (
    userId: string,
    pricing: ResolvedChatModel['pricing'],
  ) => Promise<void>;
  createChatProviderAdapter?: (model: ResolvedChatModel) => ChatProviderAdapter;
  debitForAgentRun?: DebitForAgentRun;
  resolveImageModelForUser?: (
    userId: string,
    modelId: string,
    mode: ImageModelMode,
  ) => Promise<ResolvedImageModel>;
  createImageProviderAdapter?: (model: ResolvedImageModel) => ImageProviderAdapter;
  resolveVideoModelForUser?: (
    userId: string,
    modelId: string,
  ) => Promise<ResolvedVideoModel>;
  createVideoProviderAdapter?: (model: ResolvedVideoModel) => MediaProviderAdapter;
  resolveVideoGenerationPolicyForUser?: (userId: string) => Promise<VideoGenerationPolicy>;
  mediaAssetRepository?: GeneratedMediaAssetRepository;
  signVideoMaterialUrl?: VideoMaterialSigner;
  waitForVideoPoll?: (attempt: number) => Promise<void>;
  debitForImageAgentRun?: DebitForImageAgentRun;
};

export type CreateAndRunAgentRunInput = {
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  modelId?: string;
  conversationId?: string;
  input: Record<string, unknown>;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cloneRecord(record: Record<string, unknown>) {
  return structuredClone(record);
}

const MEDIA_ARTIFACT_KINDS = new Set(['image', 'video']);

function readArtifactString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function readArtifactNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTransientArtifact(artifact: AgentArtifactInput): TransientAgentArtifactDto | null {
  if (!MEDIA_ARTIFACT_KINDS.has(artifact.kind)) {
    return null;
  }

  const metadata = cloneRecord(artifact.metadata ?? {});
  const mimeType = readArtifactString(metadata, 'mimeType') ?? 'application/octet-stream';
  const dataUrl = artifact.body && artifact.body.startsWith('data:') ? artifact.body : undefined;
  const url =
    artifact.url &&
    (artifact.url.startsWith('data:') ||
      artifact.url.startsWith('https://') ||
      artifact.url.startsWith('http://'))
      ? artifact.url
      : undefined;
  const payload = dataUrl ?? url;
  if (!payload) {
    return null;
  }

  const width = readArtifactNumber(metadata, 'width') ?? undefined;
  const height = readArtifactNumber(metadata, 'height') ?? undefined;
  const byteLength = readArtifactNumber(metadata, 'byteLength') ?? undefined;
  const model = readArtifactString(metadata, 'model') ?? undefined;

  return {
    kind: artifact.kind as TransientAgentArtifactDto['kind'],
    title: artifact.title,
    mimeType,
    dataUrl: payload,
    filename: readArtifactString(metadata, 'filename') ?? undefined,
    metadata: {
      ...metadata,
      transient: true,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(byteLength !== undefined ? { byteLength } : {}),
      ...(model !== undefined ? { model } : {}),
    },
  };
}

function toDurableArtifactSummary(artifact: AgentArtifactInput): AgentArtifactInput {
  if (!MEDIA_ARTIFACT_KINDS.has(artifact.kind)) {
    return artifact;
  }

  return {
    kind: artifact.kind,
    title: artifact.title,
    body: null,
    url: null,
    metadata: {
      ...cloneRecord(artifact.metadata ?? {}),
      transient: true,
    },
  };
}

function splitTransientArtifacts(artifacts: AgentArtifactInput[]) {
  return {
    durableArtifacts: artifacts.map(toDurableArtifactSummary),
    transientArtifacts: artifacts
      .map(toTransientArtifact)
      .filter((artifact): artifact is TransientAgentArtifactDto => artifact !== null),
  };
}

function isMediaTask(taskType: AgentTaskType) {
  return taskType === 'image' || taskType === 'video';
}

function hasUsableDirectMedia(artifacts: AgentArtifactInput[]) {
  return artifacts.some((artifact) => toDirectMediaResult(artifact));
}

function runResult(
  run: AgentRunDto,
  transientArtifacts: TransientAgentArtifactDto[] = [],
): CreateAgentRunResult {
  return { run, transientArtifacts };
}

function createMediaRunScheduler(): MediaRunScheduler {
  const activeRuns = new Map<string, Promise<void>>();

  return {
    schedule(runId, task) {
      const scheduled = Promise.resolve().then(task);
      activeRuns.set(runId, scheduled);
      const cleanup = () => {
        if (activeRuns.get(runId) === scheduled) {
          activeRuns.delete(runId);
        }
      };
      scheduled.then(cleanup, cleanup);
    },
    getActiveRunIds() {
      return [...activeRuns.keys()];
    },
  };
}

async function recordEventIfSupported(
  repository: AgentRunRepository,
  runId: string,
  type: string,
  message?: string,
  metadata?: Record<string, unknown>,
) {
  if (typeof repository.recordEvent !== 'function') {
    return;
  }

  try {
    await repository.recordEvent(runId, {
      type,
      message: message ?? null,
      metadata: cloneRecord(metadata ?? {}),
    });
  } catch {
    // Run events are observational. State transitions should not depend on event persistence.
  }
}

async function appendRunEventIfSupported(
  repository: AgentRunRepository,
  runId: string,
  event: Parameters<AgentRunRepository['appendRunEvent']>[1],
) {
  try {
    await repository.appendRunEvent(runId, event);
  } catch {
    // Stream events are observational. State transitions and billing snapshots should not depend on event persistence.
  }
}

function requireUpdatedRun(run: AgentRunDto | null, action: string): AgentRunDto {
  if (!run) {
    throw new Error(`Agent run repository returned null while trying to ${action}`);
  }

  return run;
}

async function appendRunEventsRequired(
  repository: AgentRunRepository,
  runId: string,
  input: Parameters<AgentRunRepository['appendRunEvents']>[1],
) {
  await repository.appendRunEvents(runId, input);
}

function toSelectedModelSnapshot(
  model: ResolvedChatModel | ResolvedImageModel | ResolvedVideoModel,
) {
  return {
    id: model.id,
    code: model.code,
    name: model.name,
    providerName: model.providerName,
    entitlementLabel: model.entitlement.label,
  };
}

function toResolvedModelSnapshot(model: ResolvedChatModel | ResolvedImageModel | ResolvedVideoModel) {
  return structuredClone({
    id: model.id,
    code: model.code,
    name: model.name,
    providerName: model.providerName,
    providerId: model.providerId,
    providerCode: model.providerCode,
    providerType: model.providerType,
    baseUrl: model.baseUrl,
    credentialEnvKey: model.credentialEnvKey,
    model: model.model,
    executionProtocol: model.executionProtocol,
    pricing: model.pricing,
    billingRules: model.billingRules ?? {},
    entitlement: model.entitlement,
    ...(Array.isArray((model as ResolvedImageModel).supportedModes)
      ? { supportedModes: [...(model as ResolvedImageModel).supportedModes] }
      : {}),
    ...((model as ResolvedVideoModel).supportsVideoGeneration ? { supportsVideoGeneration: true } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildProviderRawUsage(
  rawMetadata: Record<string, unknown>,
  usage?: AiUsage,
): Record<string, unknown> {
  const providerUsage = isRecord(rawMetadata.usage) ? rawMetadata.usage : {};

  return {
    ...(typeof usage?.promptTokens === 'number' ? { prompt_tokens: usage.promptTokens } : {}),
    ...(typeof usage?.completionTokens === 'number'
      ? { completion_tokens: usage.completionTokens }
      : {}),
    ...(typeof usage?.totalTokens === 'number' ? { total_tokens: usage.totalTokens } : {}),
    ...providerUsage,
  };
}

function calculateChatRunCreditCost(input: {
  model: ResolvedChatModel;
  usage: AiUsage;
  rawMetadata: Record<string, unknown>;
}) {
  if (input.model.billingRules?.chat) {
    const normalizedUsage = normalizeProviderUsage({
      providerType: input.model.providerType,
      taskType: 'chat',
      rawUsage: buildProviderRawUsage(input.rawMetadata, input.usage),
      runInput: {},
    });

    return calculateProviderCreditCost({
      taskType: 'chat',
      usage: normalizedUsage,
      rules: input.model.billingRules,
    });
  }

  return calculateChatCreditCost({
    usage: input.usage,
    pricing: input.model.pricing,
  });
}

function calculateMediaRunCreditCost(input: {
  taskType: 'image' | 'video';
  model: ResolvedImageModel | ResolvedVideoModel;
  rawMetadata: Record<string, unknown>;
  runInput: Record<string, unknown>;
}) {
  const providerRule =
    input.taskType === 'video'
      ? input.model.billingRules?.video
      : input.model.billingRules?.image;

  if (providerRule) {
    const normalizedUsage = normalizeProviderUsage({
      providerType: input.model.providerType,
      taskType: input.taskType,
      rawUsage: buildProviderRawUsage(input.rawMetadata),
      runInput: input.runInput,
    });

    return calculateProviderCreditCost({
      taskType: input.taskType,
      usage: normalizedUsage,
      rules: input.model.billingRules ?? {},
    });
  }

  return calculateImageCreditCost({ pricing: input.model.pricing });
}

function toImageMode(value: unknown): ImageModelMode {
  return value === 'edit' || value === 'upscale' ? value : 'generate';
}

function readStringInput(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumberInput(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveIntegerInput(input: Record<string, unknown>, key: string) {
  const value = readNumberInput(input, key);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

function readBooleanInput(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'boolean' ? value : null;
}

const MAX_SOURCE_IMAGE_DATA_URL_BYTES = 10 * 1024 * 1024;
const SOURCE_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function readRequiredSourceImageDataUrl(mode: ImageModelMode, input: Record<string, unknown>) {
  const sourceImageDataUrl = typeof input.sourceImageDataUrl === 'string' ? input.sourceImageDataUrl : undefined;
  if (mode !== 'edit' && mode !== 'upscale') {
    return sourceImageDataUrl;
  }

  if (
    !sourceImageDataUrl ||
    sourceImageDataUrl.length > MAX_SOURCE_IMAGE_DATA_URL_BYTES ||
    !SOURCE_IMAGE_DATA_URL_PATTERN.test(sourceImageDataUrl)
  ) {
    throw new AgentRunImageSourceRequiredError();
  }

  return sourceImageDataUrl;
}

const IMAGE_SIZE_RATIO_MAP: Record<string, string> = {
  '1:1': '1920x1920',
  '16:9': '2560x1440',
  '9:16': '1440x2560',
  '4:3': '2304x1728',
};

const IMAGE_PROVIDER_SIZE_PATTERN = /^(?:[1-9]\d{1,4}x[1-9]\d{1,4}|[234]k)$/;
const MIN_IMAGE_PROVIDER_PIXELS = 3_686_400;

function imageSizePixelCount(size: string) {
  const match = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/.exec(size);
  if (!match) {
    return null;
  }

  return Number(match[1]) * Number(match[2]);
}

function normalizeImageSizeInput(input: Record<string, unknown>) {
  const rawSize = readStringInput(input, 'size');
  if (!rawSize) {
    return undefined;
  }

  const mapped = IMAGE_SIZE_RATIO_MAP[rawSize] ?? rawSize.toLowerCase();
  if (!IMAGE_PROVIDER_SIZE_PATTERN.test(mapped)) {
    throw new AgentRunImageSizeInvalidError();
  }

  const pixels = imageSizePixelCount(mapped);
  if (pixels !== null && pixels < MIN_IMAGE_PROVIDER_PIXELS) {
    throw new AgentRunImageSizeInvalidError();
  }

  return mapped;
}

function toChatCapabilitySnapshot(model: ResolvedChatModel): AgentCapabilitySnapshot & Record<string, unknown> {
  return {
    bundleId: `chat-model-${model.id}`,
    bundleCode: `chat-${model.code}`,
    provider: model.providerCode,
    model: model.model,
    capabilities: [
      {
        id: model.id,
        kind: 'model',
        code: model.code,
        name: model.name,
        config: {
          providerId: model.providerId,
          providerCode: model.providerCode,
          providerType: model.providerType,
          model: model.model,
        },
      },
    ],
    selectedModel: toSelectedModelSnapshot(model),
    billing: {
      status: 'pending',
      creditCost: null,
      ledgerEntryId: null,
    },
    entitlement: model.entitlement,
    pricing: model.pricing,
  };
}

function toChatRunInput(input: Record<string, unknown>, model: ResolvedChatModel) {
  return {
    ...cloneRecord(input),
    modelId: model.id,
    selectedModel: toSelectedModelSnapshot(model),
  };
}

function toImageCapabilitySnapshot(
  model: ResolvedImageModel,
  mode: ImageModelMode,
): AgentCapabilitySnapshot & Record<string, unknown> {
  return {
    bundleId: `image-model-${model.id}`,
    bundleCode: `image-${model.code}`,
    provider: model.providerCode,
    model: model.model,
    capabilities: [
      {
        id: model.id,
        kind: 'model',
        code: model.code,
        name: model.name,
        config: {
          providerId: model.providerId,
          providerCode: model.providerCode,
          providerType: model.providerType,
          model: model.model,
          mode,
          supportedModes: [...model.supportedModes],
        },
      },
    ],
    selectedModel: toSelectedModelSnapshot(model),
    resolvedModel: toResolvedModelSnapshot(model),
    billing: {
      status: 'pending',
      creditCost: null,
      ledgerEntryId: null,
    },
    entitlement: model.entitlement,
    pricing: model.pricing,
    supportedModes: [...model.supportedModes],
  };
}

function toVideoCapabilitySnapshot(
  model: ResolvedVideoModel,
): AgentCapabilitySnapshot & Record<string, unknown> {
  return {
    bundleId: `video-model-${model.id}`,
    bundleCode: `video-${model.code}`,
    provider: model.providerCode,
    model: model.model,
    capabilities: [
      {
        id: model.id,
        kind: 'model',
        code: model.code,
        name: model.name,
        config: {
          providerId: model.providerId,
          providerCode: model.providerCode,
          providerType: model.providerType,
          model: model.model,
          supportsVideoGeneration: true,
        },
      },
    ],
    selectedModel: toSelectedModelSnapshot(model),
    resolvedModel: toResolvedModelSnapshot(model),
    billing: {
      status: 'pending',
      creditCost: null,
      ledgerEntryId: null,
    },
    entitlement: model.entitlement,
    pricing: model.pricing,
    supportsVideoGeneration: true,
  };
}

function sanitizeImageRunInput(input: Record<string, unknown>, model: ResolvedImageModel, mode: ImageModelMode) {
  const { sourceImageDataUrl: _sourceImageDataUrl, ...durableInput } = cloneRecord(input);
  return {
    ...durableInput,
    mode,
    modelId: model.id,
    selectedModel: toSelectedModelSnapshot(model),
  };
}

function sanitizeVideoRunInput(input: Record<string, unknown>, model: ResolvedVideoModel) {
  const canonicalInput = toCanonicalVideoInput(input);
  return {
    ...canonicalInput,
    modelId: model.id,
    selectedModel: toSelectedModelSnapshot(model),
    resolvedModel: toResolvedModelSnapshot(model),
  };
}

function toCanonicalVideoInput(input: Record<string, unknown>) {
  const durationSeconds = readPositiveIntegerInput(input, 'durationSeconds');
  const resolution = readStringInput(input, 'resolution');
  const styleCode = readStringInput(input, 'styleCode');
  const imageAssetId = readStringInput(input, 'imageAssetId');
  const audioAssetId = readStringInput(input, 'audioAssetId');

  if (durationSeconds === null || !resolution) {
    throw new AgentRunVideoSelectionError({
      code: 'invalid_request',
      message: 'Video generation requires durationSeconds and resolution.',
    });
  }

  return {
    durationSeconds,
    resolution,
    ...(styleCode ? { styleCode } : {}),
    ...(imageAssetId ? { imageAssetId } : {}),
    ...(audioAssetId ? { audioAssetId } : {}),
  };
}

async function resolveVideoMaterialUrls(input: {
  userId: string;
  input: ReturnType<typeof toCanonicalVideoInput>;
  repository?: GeneratedMediaAssetRepository;
  signVideoMaterialUrl: VideoMaterialSigner;
}) {
  const output: { imageUrl?: string; audioUrl?: string } = {};
  const repository =
    input.input.imageAssetId || input.input.audioAssetId
      ? input.repository ?? createDatabaseGeneratedMediaAssetRepository()
      : null;

  if (input.input.imageAssetId) {
    const asset = await repository?.findAssetForUser({
      userId: input.userId,
      assetId: input.input.imageAssetId,
    });
    if (!asset) {
      throw new AgentRunVideoMaterialError({
        code: 'forbidden',
        message: 'Selected image material was not found.',
      });
    }
    if (asset.kind !== 'image') {
      throw new AgentRunVideoMaterialError({
        code: 'invalid_request',
        message: 'Selected image material must be an image asset.',
      });
    }
    output.imageUrl = await input.signVideoMaterialUrl(asset);
  }

  if (input.input.audioAssetId) {
    const asset = await repository?.findAssetForUser({
      userId: input.userId,
      assetId: input.input.audioAssetId,
    });
    if (!asset) {
      throw new AgentRunVideoMaterialError({
        code: 'forbidden',
        message: 'Selected audio material was not found.',
      });
    }
    if (asset.kind !== 'audio') {
      throw new AgentRunVideoMaterialError({
        code: 'invalid_request',
        message: 'Selected audio material must be an audio asset.',
      });
    }
    output.audioUrl = await input.signVideoMaterialUrl(asset);
  }

  return output;
}

function selectMembershipEntitlement(entitlements: ActiveUserEntitlement[]) {
  const membershipEntitlements = entitlements.filter(
    (entitlement) =>
      entitlement.source === 'membership' &&
      entitlement.benefitCode === null &&
      (entitlement.planVersionId || entitlement.planCode),
  );

  return membershipEntitlements.toSorted((left, right) => {
    const leftHasVersion = left.planVersionId ? 1 : 0;
    const rightHasVersion = right.planVersionId ? 1 : 0;
    if (leftHasVersion !== rightHasVersion) {
      return rightHasVersion - leftHasVersion;
    }

    const leftExpiry = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    const rightExpiry = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftExpiry !== rightExpiry) {
      return rightExpiry - leftExpiry;
    }

    return (left.planCode ?? '').localeCompare(right.planCode ?? '');
  })[0] ?? null;
}

async function resolveDefaultVideoGenerationPolicyForUser(userId: string) {
  const [entitlements, styles] = await Promise.all([
    listActiveUserEntitlements(userId),
    listEnabledVideoStylePresets(),
  ]);
  const entitlement = selectMembershipEntitlement(entitlements);
  let planConfig = null;

  if (entitlement?.planVersionId) {
    planConfig = await getVideoPlanConfigByVersionId(entitlement.planVersionId);
  } else if (entitlement?.planCode) {
    const version = await resolvePlanVersionForEntitlement(entitlement.planCode, {
      loader: membershipPlanVersionRepository,
    });
    planConfig =
      version?.videoGenerationPolicy ??
      (version ? await getVideoPlanConfigByVersionId(version.id) : null);
  }

  return resolveVideoGenerationPolicy({
    entitlement,
    planConfig,
    styles,
  });
}

async function signVideoMaterialWithTencentCos(asset: GeneratedMediaAssetDto) {
  try {
    return await createTencentCosClient().createSignedReadUrl(asset.objectKey, 600);
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      throw error;
    }
    throw new ProviderConfigurationError(
      `Tencent COS media signing is not configured: ${toErrorMessage(error)}`,
    );
  }
}

function toChatProviderMessages(runs: AgentRunDto[], nextPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const run of runs) {
    messages.push({ role: 'user', content: run.prompt });
    if (run.finalMessage) {
      messages.push({ role: 'assistant', content: run.finalMessage });
    }
  }
  messages.push({ role: 'user', content: nextPrompt });
  return messages;
}

function toFailedChatSnapshot(input: {
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  providerResult?: ChatProviderResult;
  creditCost?: number | null;
  errorMessage: string;
}) {
  return {
    ...input.capabilitySnapshot,
    ...(input.providerResult
      ? {
          usage: input.providerResult.usage,
          rawMetadata: input.providerResult.rawMetadata,
        }
      : {}),
    billing: {
      status: 'failed',
      creditCost: input.creditCost ?? null,
      ledgerEntryId: null,
    },
    failure: {
      message: input.errorMessage,
    },
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;
}

function toFailedImageSnapshot(input: {
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  providerResult?: ImageProviderResult;
  creditCost?: number | null;
  errorMessage: string;
}) {
  return {
    ...input.capabilitySnapshot,
    ...(input.providerResult
      ? {
          rawMetadata: input.providerResult.rawMetadata,
        }
      : {}),
    billing: {
      status: 'failed',
      creditCost: input.creditCost ?? null,
      ledgerEntryId: null,
    },
    failure: {
      message: input.errorMessage,
    },
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;
}

function toFailedVideoSnapshot(input: {
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  rawMetadata?: Record<string, unknown>;
  creditCost?: number | null;
  errorMessage: string;
}) {
  return {
    ...input.capabilitySnapshot,
    ...(input.rawMetadata ? { rawMetadata: input.rawMetadata } : {}),
    billing: {
      status: 'failed',
      creditCost: input.creditCost ?? null,
      ledgerEntryId: null,
    },
    failure: {
      message: input.errorMessage,
    },
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;
}

function providerArtifact(input: {
  model: ResolvedChatModel;
  providerResult: ChatProviderResult;
  billing: Record<string, unknown>;
}) {
  return {
    kind: 'text' as const,
    title: 'AI 回复',
    body: input.providerResult.finalMessage,
    metadata: {
      provider: input.model.providerCode,
      model: input.model.model,
      usage: input.providerResult.usage,
      billing: input.billing,
    },
  };
}

export function createAgentRunService({
  repository,
  conversationRepository = getAgentConversationRepository(),
  runtime,
  resolveChatModelForUser = defaultResolveChatModelForUser,
  assertCanAffordMinimum = defaultAssertCanAffordMinimum,
  createChatProviderAdapter = defaultCreateChatProviderAdapter,
  debitForAgentRun = defaultDebitForAgentRun,
  resolveImageModelForUser = defaultResolveImageModelForUser,
  createImageProviderAdapter = () => defaultCreateImageProviderAdapter(),
  resolveVideoModelForUser = defaultResolveVideoModelForUser,
  createVideoProviderAdapter = (model) => createMediaProviderAdapter(model),
  resolveVideoGenerationPolicyForUser = resolveDefaultVideoGenerationPolicyForUser,
  mediaAssetRepository,
  signVideoMaterialUrl = signVideoMaterialWithTencentCos,
  waitForVideoPoll = async () => {},
  debitForImageAgentRun = defaultDebitForImageAgentRun,
}: CreateAgentRunServiceInput) {
  return {
    async createAndRunAgentRun(input: CreateAndRunAgentRunInput): Promise<CreateAgentRunResult> {
      if (input.taskType === 'chat') {
        return createAndRunChatAgentRun({
          input,
          repository,
          conversationRepository,
          resolveChatModelForUser,
          assertCanAffordMinimum,
          createChatProviderAdapter,
          debitForAgentRun,
        });
      }

      if (input.taskType === 'image') {
        return createAndRunImageAgentRun({
          input,
          repository,
          resolveImageModelForUser,
          assertCanAffordMinimum,
          createImageProviderAdapter,
          debitForImageAgentRun,
        });
      }

      if (input.taskType === 'video') {
        return createAndRunVideoAgentRun({
          input,
          repository,
          resolveVideoModelForUser,
          assertCanAffordMinimum,
          createVideoProviderAdapter,
          resolveVideoGenerationPolicyForUser,
          mediaAssetRepository,
          signVideoMaterialUrl,
          debitForImageAgentRun,
        });
      }

      const configuredSnapshot = await resolveDefaultAgentCapabilityBundle(input.taskType);
      const capabilitySnapshot =
        configuredSnapshot ?? createUnconfiguredCapabilitySnapshot(input.taskType);

      const created = await repository.createRun({
        userId: input.userId,
        taskType: input.taskType,
        prompt: input.prompt,
        provider: capabilitySnapshot.provider,
        model: capabilitySnapshot.model,
        capabilitySnapshot,
        input: input.input,
      });

      await recordEventIfSupported(repository, created.id, 'queued', 'Agent run queued', {
        taskType: input.taskType,
      });

      if (!configuredSnapshot) {
        const error = new AgentCapabilityBundleNotFoundError(input.taskType);
        await recordEventIfSupported(repository, created.id, 'failed', error.message, {
          reason: 'missing_default_capability_bundle',
        });
        return runResult(requireUpdatedRun(await repository.failRun(created.id, error.message), 'fail run'));
      }

      try {
        const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
        await recordEventIfSupported(repository, running.id, 'running', 'Agent runtime started', {
          provider: capabilitySnapshot.provider,
          model: capabilitySnapshot.model,
        });

        const result = await runtime.run({
          runId: running.id,
          userId: input.userId,
          taskType: input.taskType,
          prompt: input.prompt,
          provider: capabilitySnapshot.provider,
          model: capabilitySnapshot.model,
          capabilities: structuredClone(capabilitySnapshot.capabilities),
          input: cloneRecord(input.input),
        });
        const { durableArtifacts, transientArtifacts } = splitTransientArtifacts(result.artifacts);

        const completed = requireUpdatedRun(
          await repository.completeRun(running.id, {
            finalMessage: result.finalMessage,
            artifacts: durableArtifacts,
          }),
          'complete run',
        );
        await recordEventIfSupported(repository, completed.id, 'succeeded', 'Agent run succeeded', {
          artifactCount: result.artifacts.length,
        });

        return runResult(completed, transientArtifacts);
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        await recordEventIfSupported(repository, created.id, 'failed', errorMessage);
        return runResult(requireUpdatedRun(await repository.failRun(created.id, errorMessage), 'fail run'));
      }
    },
    async syncVideoAgentRunForUser(userId: string, runId: string): Promise<AgentRunDto> {
      return syncVideoAgentRunForUser({
        repository,
        userId,
        runId,
        createVideoProviderAdapter,
        debitForImageAgentRun,
        waitForVideoPoll,
      });
    },
  };
}

async function createAndRunVideoAgentRun(input: {
  input: CreateAndRunAgentRunInput;
  repository: AgentRunRepository;
  resolveVideoModelForUser: (userId: string, modelId: string) => Promise<ResolvedVideoModel>;
  assertCanAffordMinimum: (
    userId: string,
    pricing: ResolvedVideoModel['pricing'],
  ) => Promise<void>;
  createVideoProviderAdapter: (model: ResolvedVideoModel) => MediaProviderAdapter;
  resolveVideoGenerationPolicyForUser: (userId: string) => Promise<VideoGenerationPolicy>;
  mediaAssetRepository?: GeneratedMediaAssetRepository;
  signVideoMaterialUrl: VideoMaterialSigner;
  debitForImageAgentRun: DebitForImageAgentRun;
}): Promise<CreateAgentRunResult> {
  const { repository, resolveVideoModelForUser, assertCanAffordMinimum } = input;
  const request = input.input;
  if (!request.modelId) {
    throw new AgentRunModelRequiredError();
  }

  const canonicalInput = toCanonicalVideoInput(request.input);
  const policy = await input.resolveVideoGenerationPolicyForUser(request.userId);
  const selectedStyleCode = canonicalInput.styleCode ?? policy.defaults.styleCode;
  if (!selectedStyleCode) {
    throw new AgentRunVideoSelectionError({
      code: 'invalid_request',
      message: 'The selected video style is not available.',
    });
  }
  const selection = validateVideoGenerationSelection({
    policy,
    selection: {
      styleCode: selectedStyleCode,
      durationSeconds: canonicalInput.durationSeconds,
      resolution: canonicalInput.resolution,
    },
  });
  if (!selection.ok) {
    throw new AgentRunVideoSelectionError({
      code: selection.code === 'policy_disabled' ? 'forbidden' : 'invalid_request',
      message: selection.message,
    });
  }

  const model = await resolveVideoModelForUser(request.userId, request.modelId);
  await assertCanAffordMinimum(request.userId, model.pricing);
  const materialUrls = await resolveVideoMaterialUrls({
    userId: request.userId,
    input: canonicalInput,
    repository: input.mediaAssetRepository,
    signVideoMaterialUrl: input.signVideoMaterialUrl,
  });

  const capabilitySnapshot = toVideoCapabilitySnapshot(model);
  const runInput = sanitizeVideoRunInput(
    {
      ...canonicalInput,
      styleCode: selectedStyleCode,
    },
    model,
  );
  const created = await repository.createRun({
    userId: request.userId,
    conversationId: request.conversationId,
    taskType: request.taskType,
    prompt: request.prompt,
    provider: capabilitySnapshot.provider,
    model: capabilitySnapshot.model,
    capabilitySnapshot,
    input: runInput,
  });

  await recordEventIfSupported(repository, created.id, 'queued', 'Agent run queued', {
    taskType: request.taskType,
    modelId: model.id,
  });

  const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
  await recordEventIfSupported(repository, running.id, 'running', 'Video provider started', {
    provider: model.providerCode,
    model: model.model,
  });

  const adapter = input.createVideoProviderAdapter(model);
  if (!adapter.createVideoTask) {
    throw new Error('Video provider adapter does not support task creation.');
  }

  let createdTask: Awaited<ReturnType<NonNullable<typeof adapter.createVideoTask>>>;
  try {
    createdTask = await adapter.createVideoTask({
      runId: running.id,
      userId: request.userId,
      model,
      prompt: request.prompt,
      duration: canonicalInput.durationSeconds,
      resolution: canonicalInput.resolution,
      imageUrl: materialUrls.imageUrl,
      audioUrl: materialUrls.audioUrl,
      ratio: readStringInput(request.input, 'ratio') ?? undefined,
      seed: readNumberInput(request.input, 'seed') ?? undefined,
      watermark: readBooleanInput(request.input, 'watermark') ?? undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '视频任务创建失败，请稍后重试。';
    const failedSnapshot = toFailedVideoSnapshot({
      capabilitySnapshot,
      errorMessage,
    });
    await repository.failRun(running.id, {
      errorMessage,
      capabilitySnapshot: failedSnapshot,
      input: {
        ...runInput,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    await appendRunEventIfSupported(repository, running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    throw error;
  }

  const nextCapabilitySnapshot = {
    ...capabilitySnapshot,
    providerTaskId: createdTask.providerTaskId,
    providerTaskStatus: 'running',
    rawMetadata: createdTask.rawMetadata,
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;

  const nextRunInput = {
    ...runInput,
    providerTaskId: createdTask.providerTaskId,
  };

  const updated = requireUpdatedRun(
    await repository.patchRun(running.id, {
      capabilitySnapshot: nextCapabilitySnapshot,
      input: nextRunInput,
    }),
    'persist video task metadata',
  );
  await appendRunEventIfSupported(repository, updated.id, {
    eventType: 'artifact_started',
    payload: {
      taskType: request.taskType,
      providerTaskId: createdTask.providerTaskId,
      startedAt: new Date().toISOString(),
    },
  });

  return runResult(updated);
}

async function syncVideoAgentRunForUser(input: {
  repository: AgentRunRepository;
  userId: string;
  runId: string;
  createVideoProviderAdapter: (model: ResolvedVideoModel) => MediaProviderAdapter;
  debitForImageAgentRun: DebitForImageAgentRun;
  waitForVideoPoll: (attempt: number) => Promise<void>;
}): Promise<AgentRunDto> {
  const detail = await input.repository.getRunDetailForUser(input.runId, input.userId);
  if (!detail) {
    throw new Error('Agent run was not found.');
  }

  const snapshot = (detail.internal?.capabilitySnapshot ?? {}) as AgentCapabilitySnapshot &
    Record<string, unknown>;
  const storedModel = snapshot.resolvedModel;
  const model = (storedModel && typeof storedModel === 'object' ? storedModel : null) as ResolvedVideoModel | null;
  const providerTaskId =
    (typeof snapshot.providerTaskId === 'string' ? snapshot.providerTaskId : null) ??
    (typeof detail.internal?.input?.providerTaskId === 'string' ? detail.internal.input.providerTaskId : null);

  if (!model || !providerTaskId) {
    return detail.run;
  }

  const adapter = input.createVideoProviderAdapter(model);
  if (!adapter.getVideoTask) {
    throw new Error('Video provider adapter does not support task status sync.');
  }

  await input.waitForVideoPoll(0);
  const providerResult = await adapter.getVideoTask({
    runId: detail.run.id,
    userId: input.userId,
    model,
    providerTaskId,
  });

  if (providerResult.status === 'running') {
    await appendRunEventIfSupported(input.repository, detail.run.id, {
      eventType: 'artifact_progress',
      payload: {
        providerTaskId,
        status: 'running',
        polledAt: new Date().toISOString(),
      },
    });
    const latest = await input.repository.getRunForUser(detail.run.id, input.userId);
    return latest ?? detail.run;
  }

  if (providerResult.status === 'failed') {
    const failedSnapshot = toFailedVideoSnapshot({
      capabilitySnapshot: {
        ...snapshot,
        providerTaskId,
        providerTaskStatus: 'failed',
      },
      rawMetadata: providerResult.rawMetadata,
      errorMessage: providerResult.errorMessage ?? '视频生成失败',
    });
    await input.repository.failRun(detail.run.id, {
      errorMessage: providerResult.errorMessage ?? '视频生成失败',
      capabilitySnapshot: failedSnapshot,
      input: {
        ...(detail.internal?.input ?? {}),
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    await appendRunEventIfSupported(input.repository, detail.run.id, {
      eventType: 'run_failed',
      payload: {
        message: providerResult.errorMessage ?? '视频生成失败',
        failedAt: new Date().toISOString(),
      },
    });
    return requireUpdatedRun(await input.repository.getRunForUser(detail.run.id, input.userId), 'load failed run');
  }

  if (!providerResult.outputUrl) {
    throw new Error('Provider response did not include video output.');
  }

  const artifact: AgentArtifactInput = {
    kind: 'video',
    title: 'Generated video',
    url: providerResult.outputUrl,
    metadata: {
      mimeType: 'video/mp4',
      model: model.model,
      providerTaskId,
      ...(isRecord(providerResult.rawMetadata.usage) ? { usage: providerResult.rawMetadata.usage } : {}),
    },
  };
  const creditCost = calculateMediaRunCreditCost({
    taskType: 'video',
    model,
    rawMetadata: providerResult.rawMetadata,
    runInput: detail.internal?.input ?? {},
  });
  const debit = await input.debitForImageAgentRun({
    userId: input.userId,
    runId: detail.run.id,
    pricing: model.pricing,
    modelSnapshot: model,
    metadata: {
      rawMetadata: providerResult.rawMetadata,
      providerTaskId,
    },
    amount: creditCost,
  });

  const completedSnapshot = {
    ...snapshot,
    providerTaskId,
    providerTaskStatus: 'succeeded',
    rawMetadata: providerResult.rawMetadata,
    billing: {
      status: 'billed',
      creditCost,
      ledgerEntryId: debit.entryId,
    },
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;

  const completed = requireUpdatedRun(
    await input.repository.completeRun(detail.run.id, {
      finalMessage: '视频已生成',
      artifacts: [sanitizeDirectMediaArtifact(artifact)],
      capabilitySnapshot: completedSnapshot,
      input: {
        ...(detail.internal?.input ?? {}),
        billing: completedSnapshot.billing,
      },
    }),
    'complete run',
  );

  const directMedia = toDirectMediaResult(artifact);
  if (!directMedia) {
    throw new Error('Provider response did not include video output.');
  }
  try {
    await appendRunEventIfSupported(input.repository, completed.id, {
      eventType: 'billing_recorded',
      payload: {
        creditCost,
        ledgerEntryId: debit.entryId,
        balanceAfter: debit.balanceAfter,
      },
    });
    await appendRunEventsRequired(input.repository, completed.id, [
      {
        eventType: 'artifact_completed',
        payload: createDirectMediaEventPayload(directMedia, {
          artifactId: completed.artifacts[0]?.id ?? '',
        }),
      },
    ]);
  } catch {
    const failedSnapshot = toFailedVideoSnapshot({
      capabilitySnapshot: completedSnapshot,
      rawMetadata: providerResult.rawMetadata,
      creditCost,
      errorMessage: '图片或视频结果推送失败，请重试。',
    });
    await appendRunEventIfSupported(input.repository, detail.run.id, {
      eventType: 'run_failed',
      payload: {
        message: '图片或视频结果推送失败，请重试。',
        failedAt: new Date().toISOString(),
      },
    });
    await input.repository.patchRun(detail.run.id, {
      finalMessage: '视频已生成',
      errorMessage: '图片或视频结果推送失败，请重试。',
      capabilitySnapshot: failedSnapshot,
      input: {
        ...(detail.internal?.input ?? {}),
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    await input.repository.failRun(detail.run.id, {
      errorMessage: '图片或视频结果推送失败，请重试。',
      finalMessage: '视频已生成',
      capabilitySnapshot: failedSnapshot,
      input: {
        ...(detail.internal?.input ?? {}),
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    return requireUpdatedRun(
      await input.repository.getRunForUser(detail.run.id, input.userId),
      'load failed run',
    );
  }

  await appendRunEventIfSupported(input.repository, completed.id, {
    eventType: 'run_completed',
    payload: {
      finalMessage: '视频已生成',
      artifactCount: 1,
      storageStatus: 'provider_direct',
      completedAt: new Date().toISOString(),
    },
  });

  await recordEventIfSupported(
    input.repository,
    completed.id,
    'succeeded',
    'Agent run succeeded',
    {
      artifactCount: 1,
      creditCost,
      ledgerEntryId: debit.entryId,
      storageStatus: 'provider_direct',
    },
  );
  return completed;
}

async function createAndRunChatAgentRun(input: {
  input: CreateAndRunAgentRunInput;
  repository: AgentRunRepository;
  conversationRepository: AgentConversationRepository;
  resolveChatModelForUser: (userId: string, modelId: string) => Promise<ResolvedChatModel>;
  assertCanAffordMinimum: (
    userId: string,
    pricing: ResolvedChatModel['pricing'],
  ) => Promise<void>;
  createChatProviderAdapter: (model: ResolvedChatModel) => ChatProviderAdapter;
  debitForAgentRun: DebitForAgentRun;
}): Promise<CreateAgentRunResult> {
  const { repository, resolveChatModelForUser, assertCanAffordMinimum } = input;
  const request = input.input;
  if (!request.modelId) {
    throw new AgentRunModelRequiredError();
  }

  const conversation = request.conversationId
    ? await input.conversationRepository.getConversationForUser(request.conversationId, request.userId)
    : await input.conversationRepository.createConversation({
        userId: request.userId,
        autoTitle: request.prompt,
      });
  if (!conversation) {
    throw new AgentConversationNotFoundError();
  }

  const model = await resolveChatModelForUser(request.userId, request.modelId);
  await assertCanAffordMinimum(request.userId, model.pricing);

  const capabilitySnapshot = toChatCapabilitySnapshot(model);
  const runInput = toChatRunInput(request.input, model);
  const created = await repository.createRun({
    userId: request.userId,
    conversationId: conversation.id,
    taskType: request.taskType,
    prompt: request.prompt,
    provider: capabilitySnapshot.provider,
    model: capabilitySnapshot.model,
    capabilitySnapshot,
    input: runInput,
  });

  await recordEventIfSupported(repository, created.id, 'queued', 'Agent run queued', {
    taskType: request.taskType,
    modelId: model.id,
  });

  const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
  await recordEventIfSupported(repository, running.id, 'running', 'Chat provider started', {
    provider: model.providerCode,
    model: model.model,
  });
  void runChatOrchestration({
    repository,
    model,
    request,
    runInput,
    capabilitySnapshot,
    running,
    createChatProviderAdapter: input.createChatProviderAdapter,
    debitForAgentRun: input.debitForAgentRun,
  }).catch(async (error) => {
    const errorMessage = toErrorMessage(error);
    const failedSnapshot = toFailedChatSnapshot({ capabilitySnapshot, errorMessage });
    await recordEventIfSupported(repository, running.id, 'failed', errorMessage);
    await repository.appendRunEvent(running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    await repository.failRun(running.id, {
      errorMessage,
      capabilitySnapshot: failedSnapshot,
      input: {
        ...runInput,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
  });

  return runResult(running);
}

async function createAndRunImageAgentRun(input: {
  input: CreateAndRunAgentRunInput;
  repository: AgentRunRepository;
  resolveImageModelForUser: (
    userId: string,
    modelId: string,
    mode: ImageModelMode,
  ) => Promise<ResolvedImageModel>;
  assertCanAffordMinimum: (
    userId: string,
    pricing: ResolvedImageModel['pricing'],
  ) => Promise<void>;
  createImageProviderAdapter: (model: ResolvedImageModel) => ImageProviderAdapter;
  debitForImageAgentRun: DebitForImageAgentRun;
}): Promise<CreateAgentRunResult> {
  const { repository, resolveImageModelForUser, assertCanAffordMinimum } = input;
  const request = input.input;
  if (!request.modelId) {
    throw new AgentRunModelRequiredError();
  }

  const mode = toImageMode(request.input.mode);
  const sourceImageDataUrl = readRequiredSourceImageDataUrl(mode, request.input);
  const providerSize = normalizeImageSizeInput(request.input);
  const model = await resolveImageModelForUser(request.userId, request.modelId, mode);
  await assertCanAffordMinimum(request.userId, model.pricing);

  const capabilitySnapshot = toImageCapabilitySnapshot(model, mode);
  const runInput = sanitizeImageRunInput(request.input, model, mode);
  const created = await repository.createRun({
    userId: request.userId,
    conversationId: request.conversationId,
    taskType: request.taskType,
    prompt: request.prompt,
    provider: capabilitySnapshot.provider,
    model: capabilitySnapshot.model,
    capabilitySnapshot,
    input: runInput,
  });

  await recordEventIfSupported(repository, created.id, 'queued', 'Agent run queued', {
    taskType: request.taskType,
    modelId: model.id,
    mode,
  });

  const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
  await recordEventIfSupported(repository, running.id, 'running', 'Image provider started', {
    provider: model.providerCode,
    model: model.model,
    mode,
  });

  void runImageProviderOrchestration({
    repository,
    request,
    running,
    model,
    mode,
    sourceImageDataUrl,
    providerSize,
    runInput,
    capabilitySnapshot,
    createImageProviderAdapter: input.createImageProviderAdapter,
    debitForImageAgentRun: input.debitForImageAgentRun,
  }).catch(async (error) => {
    const errorMessage = toErrorMessage(error);
    const failedSnapshot = toFailedImageSnapshot({ capabilitySnapshot, errorMessage });
    await recordEventIfSupported(repository, running.id, 'failed', errorMessage);
    await appendRunEventIfSupported(repository, running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    await repository.failRun(running.id, {
      errorMessage,
      capabilitySnapshot: failedSnapshot,
      input: {
        ...runInput,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
  });

  return runResult(running);
}

async function runImageProviderOrchestration(input: {
  repository: AgentRunRepository;
  request: CreateAndRunAgentRunInput;
  running: AgentRunDto;
  model: ResolvedImageModel;
  mode: ImageModelMode;
  sourceImageDataUrl?: string;
  providerSize?: string;
  runInput: Record<string, unknown>;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  createImageProviderAdapter: (model: ResolvedImageModel) => ImageProviderAdapter;
  debitForImageAgentRun: DebitForImageAgentRun;
}) {
  const adapter = input.createImageProviderAdapter(input.model);
  await appendRunEventIfSupported(input.repository, input.running.id, {
    eventType: 'artifact_started',
    payload: {
      taskType: input.request.taskType,
      mode: input.mode,
      startedAt: new Date().toISOString(),
    },
  });

  const providerResult = await adapter.runImage({
    runId: input.running.id,
    userId: input.request.userId,
    model: input.model,
    mode: input.mode,
    prompt: input.request.prompt,
    size: input.providerSize,
    scale: typeof input.request.input.scale === 'string' ? input.request.input.scale : undefined,
    sourceImageDataUrl: input.sourceImageDataUrl,
  });

  const acceptedArtifacts = providerResult.artifacts.filter((artifact) => artifact.kind === 'image');
  if (acceptedArtifacts.length === 0) {
    throw new Error('Provider response did not include image output.');
  }

  const directMediaResults = acceptedArtifacts
    .map(toDirectMediaResult)
    .filter((artifact): artifact is NonNullable<ReturnType<typeof toDirectMediaResult>> => artifact !== null);
  if (directMediaResults.length === 0) {
    throw new Error('Provider response did not include image output.');
  }

  const creditCost = calculateMediaRunCreditCost({
    taskType: input.request.taskType === 'video' ? 'video' : 'image',
    model: input.model,
    rawMetadata: providerResult.rawMetadata,
    runInput: input.runInput,
  });
  let debit: { entryId: string; balanceAfter: number };
  try {
    debit = await input.debitForImageAgentRun({
      userId: input.request.userId,
      runId: input.running.id,
      pricing: input.model.pricing,
      modelSnapshot: input.model,
      metadata: {
        mode: input.mode,
        rawMetadata: providerResult.rawMetadata,
      },
      amount: creditCost,
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const failedSnapshot = toFailedImageSnapshot({
      capabilitySnapshot: input.capabilitySnapshot,
      providerResult,
      creditCost,
      errorMessage,
    });
    await appendRunEventIfSupported(input.repository, input.running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    await input.repository.failRun(input.running.id, {
      errorMessage,
      finalMessage: providerResult.finalMessage,
      artifacts: acceptedArtifacts.map(sanitizeDirectMediaArtifact),
      capabilitySnapshot: failedSnapshot,
      input: {
        ...input.runInput,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    return;
  }

  await appendRunEventIfSupported(input.repository, input.running.id, {
    eventType: 'billing_recorded',
    payload: {
      creditCost,
      ledgerEntryId: debit.entryId,
      balanceAfter: debit.balanceAfter,
    },
  });

  const completedSnapshot = {
    ...input.capabilitySnapshot,
    billing: {
      status: 'billed',
      creditCost,
      ledgerEntryId: debit.entryId,
    },
    rawMetadata: providerResult.rawMetadata,
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;
  const completed = requireUpdatedRun(
    await input.repository.completeRun(input.running.id, {
      finalMessage: providerResult.finalMessage,
      artifacts: acceptedArtifacts.map(sanitizeDirectMediaArtifact),
      capabilitySnapshot: completedSnapshot,
      input: {
        ...input.runInput,
        billing: completedSnapshot.billing,
      },
    }),
    'complete run',
  );

  const directMediaPayloads = completed.artifacts
    .map((artifact, index) => {
      const directMedia = directMediaResults[index];
      if (!directMedia || (artifact.kind !== 'image' && artifact.kind !== 'video')) {
        return null;
      }

      return {
        eventType: 'artifact_completed' as const,
        payload: createDirectMediaEventPayload(directMedia, {
          artifactId: artifact.id,
        }),
      };
    })
    .filter((event): event is { eventType: 'artifact_completed'; payload: DirectMediaArtifactCompletedPayload } => event !== null);

  try {
    await appendRunEventsRequired(input.repository, input.running.id, directMediaPayloads);
  } catch {
    throw new Error('图片或视频结果推送失败，请重试。');
  }

  await appendRunEventIfSupported(input.repository, completed.id, {
    eventType: 'run_completed',
    payload: {
      finalMessage: providerResult.finalMessage,
      artifactCount: directMediaResults.length,
      storageStatus: 'provider_direct',
      completedAt: new Date().toISOString(),
    },
  });

  await recordEventIfSupported(input.repository, completed.id, 'succeeded', 'Agent run succeeded', {
    artifactCount: acceptedArtifacts.length,
    creditCost,
    ledgerEntryId: debit.entryId,
    storageStatus: 'provider_direct',
  });
}

async function runChatOrchestration(input: {
  repository: AgentRunRepository;
  model: ResolvedChatModel;
  request: CreateAndRunAgentRunInput;
  runInput: Record<string, unknown>;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  running: AgentRunDto;
  createChatProviderAdapter: (model: ResolvedChatModel) => ChatProviderAdapter;
  debitForAgentRun: DebitForAgentRun;
}) {
  const adapter = input.createChatProviderAdapter(input.model);
  const priorRuns = input.running.conversationId
    ? await input.repository.listConversationRunsForUser(input.running.conversationId, input.request.userId)
    : [];
  const priorCompletedRuns = priorRuns.filter((run) => run.id !== input.running.id && run.status === 'succeeded');
  const messages = toChatProviderMessages(priorCompletedRuns, input.request.prompt);
  await input.repository.appendRunEvent(input.running.id, {
    eventType: 'assistant_message_started',
    payload: {
      messageId: `${input.running.id}-assistant`,
      role: 'assistant',
    },
  });
  const providerResult = adapter.streamChat
    ? await collectStreamedChatResult({
        repository: input.repository,
        runId: input.running.id,
        adapter,
        model: input.model,
        userId: input.request.userId,
        messages,
      })
    : await adapter.runChat({
        runId: input.running.id,
        userId: input.request.userId,
        model: input.model,
        messages,
      });

  await input.repository.appendRunEvents(input.running.id, [
    {
      eventType: 'assistant_message_completed',
      payload: {
        messageId: `${input.running.id}-assistant`,
        finalLength: providerResult.finalMessage.length,
      },
    },
  ]);

  const creditCost = calculateChatRunCreditCost({
    model: input.model,
    usage: providerResult.usage,
    rawMetadata: providerResult.rawMetadata,
  });
  let debit: { entryId: string; balanceAfter: number };
  try {
    debit = await input.debitForAgentRun({
      userId: input.request.userId,
      runId: input.running.id,
      usage: providerResult.usage,
      pricing: input.model.pricing,
      modelSnapshot: input.model,
      amount: creditCost,
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const failedSnapshot = toFailedChatSnapshot({
      capabilitySnapshot: input.capabilitySnapshot,
      providerResult,
      creditCost,
      errorMessage,
    });
    await input.repository.appendRunEvent(input.running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    await input.repository.failRun(input.running.id, {
      errorMessage,
      finalMessage: providerResult.finalMessage,
      artifacts: [
        providerArtifact({
          model: input.model,
          providerResult,
          billing: failedSnapshot.billing as Record<string, unknown>,
        }),
      ],
      capabilitySnapshot: failedSnapshot,
      input: {
        ...input.runInput,
        usage: providerResult.usage,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    return;
  }
  await input.repository.appendRunEvent(input.running.id, {
    eventType: 'billing_recorded',
    payload: {
      creditCost,
      ledgerEntryId: debit.entryId,
      balanceAfter: debit.balanceAfter,
    },
  });

  const completedSnapshot = {
    ...input.capabilitySnapshot,
    usage: providerResult.usage,
    billing: {
      status: 'billed',
      creditCost,
      ledgerEntryId: debit.entryId,
    },
    rawMetadata: providerResult.rawMetadata,
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;

  const completed = requireUpdatedRun(
    await input.repository.completeRun(input.running.id, {
      finalMessage: providerResult.finalMessage,
      artifacts: [providerArtifact({ model: input.model, providerResult, billing: completedSnapshot.billing })],
      capabilitySnapshot: completedSnapshot,
      input: {
        ...input.runInput,
        usage: providerResult.usage,
        billing: completedSnapshot.billing,
      },
    }),
    'complete run',
  );

  await input.repository.appendRunEvent(completed.id, {
    eventType: 'run_completed',
    payload: {
      finalMessage: providerResult.finalMessage,
      usage: providerResult.usage,
      completedAt: new Date().toISOString(),
    },
  });

  await recordEventIfSupported(input.repository, completed.id, 'succeeded', 'Agent run succeeded', {
    artifactCount: 1,
    creditCost,
    ledgerEntryId: debit.entryId,
  });
}

async function collectStreamedChatResult(input: {
  repository: AgentRunRepository;
  runId: string;
  adapter: ChatProviderAdapter;
  model: ResolvedChatModel;
  userId: string;
  messages: ChatMessage[];
}) {
  const stream = input.adapter.streamChat?.({
    runId: input.runId,
    userId: input.userId,
    model: input.model,
    messages: input.messages,
  });
  if (!stream) {
    return input.adapter.runChat({
      runId: input.runId,
      userId: input.userId,
      model: input.model,
      messages: input.messages,
    });
  }

  let finalMessage = '';
  let usage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let rawMetadata: Record<string, unknown> = {};
  for await (const event of stream) {
    if (event.type === 'delta') {
      finalMessage += event.delta;
      await input.repository.appendRunEvent(input.runId, {
        eventType: 'assistant_delta',
        payload: {
          messageId: `${input.runId}-assistant`,
          delta: event.delta,
        },
      });
      continue;
    }

    finalMessage = event.finalMessage;
    usage = event.usage;
    rawMetadata = event.rawMetadata;
  }

  return { finalMessage, usage, rawMetadata };
}
