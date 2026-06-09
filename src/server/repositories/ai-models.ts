import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, or } from 'drizzle-orm';

import { createChatProviderAdapter } from '@/server/ai/provider-adapters';
import { supportsStoryboardTemplateProvider } from '@/server/ai/image-model-capabilities';
import type { PiAgentRuntime } from '@/server/agent/pi-runtime';
import type {
  AgentRunDto,
  AgentRunStreamEventDto,
  CreateAgentRunResult,
} from '@/server/agent/types';
import {
  evaluateModelEntitlement,
  listActiveUserEntitlements,
  type ActiveUserEntitlement,
  type ModelEntitlementRequirement,
  type ModelEntitlementResult,
} from '@/server/ai/model-entitlements';
import { db, schema } from '@/server/db';
import { getAgentRunRepository } from './agent-runs';
import {
  type AdminModuleData,
  ensureAdminReadSource,
} from './admin-shared';
import {
  parseProviderBillingRules,
  type ProviderBillingRuleConfig,
} from '@/server/billing/provider-rules';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDatabaseUuid(value: string) {
  return uuidPattern.test(value);
}

export type AiModelPricing = {
  unit: 'token';
  promptCreditsPer1k: number;
  completionCreditsPer1k: number;
  minimumCredits: number;
};

export type PublicChatModelDto = {
  id: string;
  code: string;
  name: string;
  model: string;
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
};

export type ImageModelMode = 'generate' | 'edit' | 'upscale';

export type PublicImageModelDto = PublicChatModelDto & {
  supportedModes: ImageModelMode[];
  supportsWorkflowStoryboardTemplate: boolean;
};

export type PublicVideoModelDto = PublicChatModelDto;

export type AiModelExecutionProtocol = typeof schema.aiModels.$inferSelect.executionProtocol;

export type ResolvedChatModel = PublicChatModelDto & {
  providerId: string;
  providerCode: string;
  providerType: 'openai_compatible' | 'development';
  baseUrl: string | null;
  credentialEnvKey: string | null;
  model: string;
  executionProtocol: AiModelExecutionProtocol;
  pricing: AiModelPricing;
  billingRules?: ProviderBillingRuleConfig;
  entitlement: ModelEntitlementResult;
};

export type ResolvedImageModel = ResolvedChatModel & {
  supportedModes: ImageModelMode[];
};

export type ResolvedVideoModel = ResolvedChatModel & {
  supportsVideoGeneration: true;
};

export type AiModelStatus = typeof schema.aiModels.$inferSelect.status;
export type AiProviderStatus = typeof schema.aiProviders.$inferSelect.status;
export type AiProviderType = typeof schema.aiProviders.$inferSelect.providerType;

export type CredentialReferenceStatus = 'valid' | 'invalid' | 'not_required';

export type CredentialReferenceSummary = {
  label: string;
  status: CredentialReferenceStatus;
  detail: string;
};

export type AdminAiModelRow = {
  id: string;
  providerId: string;
  providerName: string;
  providerCode: string;
  providerType: AiProviderType;
  providerStatus: AiProviderStatus;
  code: string;
  name: string;
  model: string;
  executionProtocol: AiModelExecutionProtocol;
  status: AiModelStatus;
  supportsChat: boolean;
  isDefaultChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
  isDefaultImage: boolean;
  isDefaultVideo: boolean;
  entitlementSummary: string;
  pricingSummary: string;
  credential: CredentialReferenceSummary;
};

export type AdminAiProviderRow = {
  id: string;
  code: string;
  name: string;
  providerType: AiProviderType;
  status: AiProviderStatus;
  baseUrlLabel: string;
  credential: CredentialReferenceSummary;
  modelCount: number;
  enabledModelCount: number;
  chatModelCount: number;
  videoModelCount: number;
  billingRules: ProviderBillingRuleConfig;
};

export type AdminAiModelData = AdminModuleData<AdminAiModelRow> & {
  providers: AdminAiProviderRow[];
};

export type AdminAiConfigTestSummary = {
  ok: boolean;
  elapsedMs: number;
  providerLabel: string;
  modelLabel: string;
  error: string | null;
};

export type AdminAiChatLoopTestResult = AdminAiConfigTestSummary & {
  prompt: string;
  run: AgentRunDto | null;
  events: AgentRunStreamEventDto[];
};

type AdminAiChatLoopAgentRunServiceFactory = (input: {
  repository: ReturnType<typeof getAgentRunRepository>;
  runtime: PiAgentRuntime;
  resolveChatModelForUser: (userId: string, modelId: string) => Promise<ResolvedChatModel>;
  assertCanAffordMinimum: (
    userId: string,
    pricing: ResolvedChatModel['pricing'],
  ) => Promise<void>;
}) => {
  createAndRunAgentRun(input: {
    userId: string;
    taskType: 'chat';
    prompt: string;
    modelId: string;
    input: Record<string, unknown>;
  }): Promise<CreateAgentRunResult>;
};

type AdminModelStatusAction = {
  label: string;
  url: string;
  body: { status: Extract<AiModelStatus, 'enabled' | 'disabled'> };
  successMessage: string;
  variant?: 'destructive';
};

export class ModelNotAvailableError extends Error {
  constructor(message = 'Model is not available.') {
    super(message);
    this.name = 'ModelNotAvailableError';
  }
}

export class ModelEntitlementRequiredError extends Error {
  constructor() {
    super('Model entitlement is required.');
    this.name = 'ModelEntitlementRequiredError';
  }
}

function isChatExecutionProtocol(protocol: AiModelExecutionProtocol) {
  return protocol === 'chat_openai_compatible';
}

function isImageExecutionProtocol(protocol: AiModelExecutionProtocol) {
  return protocol === 'image_openai_compatible';
}

function isVideoExecutionProtocol(protocol: AiModelExecutionProtocol) {
  return protocol === 'video_task_polling';
}

function validateModelCapabilityProtocol(input: {
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
  executionProtocol: AiModelExecutionProtocol;
}) {
  if (input.supportsChat && !isChatExecutionProtocol(input.executionProtocol)) {
    throw new Error('Chat-capable models must use a chat execution protocol.');
  }

  if (
    (input.supportsImageGeneration || input.supportsImageEdit || input.supportsImageUpscale) &&
    !isImageExecutionProtocol(input.executionProtocol)
  ) {
    throw new Error('Image-capable models must use an image execution protocol.');
  }

  if (input.supportsVideoGeneration && !isVideoExecutionProtocol(input.executionProtocol)) {
    throw new Error('Video-capable models must use a video execution protocol.');
  }
}

export function buildModelRequirementSeedKey(input: {
  modelId: string;
  requirementType: ModelEntitlementRequirement['type'];
  requirementValue: string | null;
}) {
  return `${input.modelId}:${input.requirementType}:${input.requirementValue ?? ''}`;
}

const defaultPricing: AiModelPricing = {
  unit: 'token',
  promptCreditsPer1k: 1,
  completionCreditsPer1k: 2,
  minimumCredits: 1,
};

const seedModels: ResolvedChatModel[] = [
  {
    id: 'seed-model-free',
    code: 'dev-free-chat',
    name: 'Development Free Chat',
    providerName: 'Development Provider',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-free-chat',
    executionProtocol: 'chat_openai_compatible',
    pricing: defaultPricing,
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
  },
  {
    id: 'seed-model-pro',
    code: 'dev-pro-chat',
    name: 'Development Pro Chat',
    providerName: 'Development Provider',
    isDefault: false,
    entitlementLabel: 'Pro',
    pricingSummary: '2 credits minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-pro-chat',
    executionProtocol: 'chat_openai_compatible',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 2,
      completionCreditsPer1k: 4,
      minimumCredits: 2,
    },
    entitlement: {
      allowed: true,
      basis: 'membership_plan',
      label: 'Pro',
      value: 'pro-monthly',
    },
  },
];

const imageSeedFreePricing: AiModelPricing = {
  unit: 'token',
  promptCreditsPer1k: 1,
  completionCreditsPer1k: 0,
  minimumCredits: 1,
};

const seedImageModels: ResolvedImageModel[] = [
  {
    id: 'seed-model-free-image',
    code: 'dev-free-image',
    name: 'Development Free Image',
    providerName: 'Development Provider',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-free-image',
    executionProtocol: 'image_openai_compatible',
    pricing: imageSeedFreePricing,
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    supportedModes: ['generate', 'edit'],
  },
  {
    id: 'seed-model-pro-image',
    code: 'dev-pro-image',
    name: 'Development Pro Image',
    providerName: 'Development Provider',
    isDefault: false,
    entitlementLabel: 'Pro',
    pricingSummary: '4 credits minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-pro-image',
    executionProtocol: 'image_openai_compatible',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 4,
      completionCreditsPer1k: 0,
      minimumCredits: 4,
    },
    entitlement: {
      allowed: true,
      basis: 'membership_plan',
      label: 'Pro',
      value: 'pro-monthly',
    },
    supportedModes: ['generate', 'edit', 'upscale'],
  },
];

const videoSeedPricing: AiModelPricing = {
  unit: 'token',
  promptCreditsPer1k: 0,
  completionCreditsPer1k: 1,
  minimumCredits: 3,
};

const seedVideoModels: ResolvedVideoModel[] = [
  {
    id: 'seed-model-free-video',
    code: 'dev-free-video',
    name: 'Development Free Video',
    providerName: 'Development Provider',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '3 credits minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-free-video',
    executionProtocol: 'video_task_polling',
    pricing: videoSeedPricing,
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    supportsVideoGeneration: true,
  },
  {
    id: 'seed-model-pro-video',
    code: 'dev-pro-video',
    name: 'Development Pro Video',
    providerName: 'Development Provider',
    isDefault: false,
    entitlementLabel: 'Pro',
    pricingSummary: '8 credits minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-pro-video',
    executionProtocol: 'video_task_polling',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 0,
      completionCreditsPer1k: 2,
      minimumCredits: 8,
    },
    entitlement: {
      allowed: true,
      basis: 'membership_plan',
      label: 'Pro',
      value: 'pro-monthly',
    },
    supportsVideoGeneration: true,
  },
];

const seedProviders = [
  {
    id: 'seed-provider-development',
    code: 'development',
    name: 'Development Provider',
    providerType: 'development',
    status: 'enabled',
    baseUrl: null,
    credentialEnvKey: null,
    metadata: {},
  },
] satisfies Array<{
  id: string;
  code: string;
  name: string;
  providerType: AiProviderType;
  status: AiProviderStatus;
  baseUrl: string | null;
  credentialEnvKey: string | null;
  metadata: Record<string, unknown>;
}>;

const adminAiLoopTestUserId = '00000000-0000-4000-8000-000000000001';

export type DatabaseChatModelRow = {
  model: Pick<
    typeof schema.aiModels.$inferSelect,
    | 'id'
    | 'providerId'
    | 'code'
    | 'name'
    | 'model'
    | 'executionProtocol'
    | 'status'
    | 'supportsChat'
    | 'supportsImageGeneration'
    | 'supportsImageEdit'
    | 'supportsImageUpscale'
    | 'supportsVideoGeneration'
    | 'isDefaultChat'
    | 'isDefaultImage'
    | 'isDefaultVideo'
    | 'pricing'
  >;
  provider: Pick<
    typeof schema.aiProviders.$inferSelect,
    'id' | 'code' | 'name' | 'providerType' | 'status' | 'baseUrl' | 'credentialEnvKey' | 'metadata'
  >;
  requirement: Pick<
    typeof schema.aiModelEntitlementRequirements.$inferSelect,
    'requirementType' | 'requirementValue' | 'label'
  > | null;
};

type ChatModelRow = DatabaseChatModelRow;

type ImageModelRow = ChatModelRow;
type VideoModelRow = ChatModelRow;

export type DatabaseImageModelRow = {
  model: Pick<
    typeof schema.aiModels.$inferSelect,
    | 'id'
    | 'providerId'
    | 'code'
    | 'name'
    | 'model'
    | 'executionProtocol'
    | 'status'
    | 'supportsChat'
    | 'supportsImageGeneration'
    | 'supportsImageEdit'
    | 'supportsImageUpscale'
    | 'isDefaultChat'
    | 'isDefaultImage'
    | 'pricing'
  >;
  provider: Pick<
    typeof schema.aiProviders.$inferSelect,
    'id' | 'code' | 'name' | 'providerType' | 'status' | 'baseUrl' | 'credentialEnvKey' | 'metadata'
  >;
  requirement: Pick<
    typeof schema.aiModelEntitlementRequirements.$inferSelect,
    'requirementType' | 'requirementValue' | 'label'
  > | null;
};

export type DatabaseVideoModelRow = DatabaseChatModelRow;

export async function getSeedChatModelsForUser(
  _userId: string,
  entitlements: ActiveUserEntitlement[],
): Promise<PublicChatModelDto[]> {
  return seedModels
    .map((model) => ({
      model,
      entitlement: evaluateModelEntitlement({
        requirements: seedRequirementForModel(model),
        entitlements,
      }),
    }))
    .filter((item) => item.entitlement.allowed)
    .map((item) => toPublicModel({ ...item.model, entitlement: item.entitlement }));
}

export async function resolveSeedChatModelForUser(
  _userId: string,
  modelId: string,
  entitlements: ActiveUserEntitlement[],
): Promise<ResolvedChatModel> {
  const model = seedModels.find((item) => item.id === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }

  const entitlement = evaluateModelEntitlement({
    requirements: seedRequirementForModel(model),
    entitlements,
  });
  if (!entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return structuredClone({ ...model, entitlement });
}

export async function getSeedImageModelsForUser(
  _userId: string,
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
): Promise<PublicImageModelDto[]> {
  return seedImageModels
    .filter((model) => model.supportedModes.includes(mode))
    .map((model) => ({
      model,
      entitlement: evaluateModelEntitlement({
        requirements: seedRequirementForModel(model),
        entitlements,
      }),
    }))
    .filter((item) => item.entitlement.allowed)
    .map((item) => toPublicImageModel({ ...item.model, entitlement: item.entitlement }));
}

export async function resolveSeedImageModelForUser(
  _userId: string,
  modelId: string,
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
): Promise<ResolvedImageModel> {
  const model = seedImageModels.find((item) => item.id === modelId);
  if (!model || !model.supportedModes.includes(mode)) {
    throw new ModelNotAvailableError();
  }

  const entitlement = evaluateModelEntitlement({
    requirements: seedRequirementForModel(model),
    entitlements,
  });
  if (!entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return structuredClone({ ...model, entitlement });
}

export async function getSeedVideoModelsForUser(
  _userId: string,
  entitlements: ActiveUserEntitlement[],
): Promise<PublicVideoModelDto[]> {
  return seedVideoModels
    .map((model) => ({
      model,
      entitlement: evaluateModelEntitlement({
        requirements: seedRequirementForModel(model),
        entitlements,
      }),
    }))
    .filter((item) => item.entitlement.allowed)
    .map((item) => toPublicModel({ ...item.model, entitlement: item.entitlement }));
}

export async function resolveSeedVideoModelForUser(
  _userId: string,
  modelId: string,
  entitlements: ActiveUserEntitlement[],
): Promise<ResolvedVideoModel> {
  const model = seedVideoModels.find((item) => item.id === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }

  const entitlement = evaluateModelEntitlement({
    requirements: seedRequirementForModel(model),
    entitlements,
  });
  if (!entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return structuredClone({ ...model, entitlement });
}

export async function listAvailableChatModelsForUser(
  userId: string,
): Promise<PublicChatModelDto[]> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return getSeedChatModelsForUser(userId, entitlements);
  }

  return listDatabaseChatModelsForUserFromRows(await loadDatabaseChatModelRows(), entitlements);
}

export async function resolveChatModelForUser(
  userId: string,
  modelId: string,
): Promise<ResolvedChatModel> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return resolveSeedChatModelForUser(userId, modelId, entitlements);
  }

  return resolveDatabaseChatModelForUserFromRows(
    await loadDatabaseChatModelRows(modelId),
    modelId,
    entitlements,
  );
}

export async function listAvailableImageModelsForUser(
  userId: string,
  mode: ImageModelMode,
): Promise<PublicImageModelDto[]> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return getSeedImageModelsForUser(userId, mode, entitlements);
  }

  return listDatabaseImageModelsForUserFromRows(
    await loadDatabaseImageModelRows(mode),
    mode,
    entitlements,
  );
}

export async function resolveImageModelForUser(
  userId: string,
  modelId: string,
  mode: ImageModelMode,
): Promise<ResolvedImageModel> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return resolveSeedImageModelForUser(userId, modelId, mode, entitlements);
  }

  return resolveDatabaseImageModelForUserFromRows(
    await loadDatabaseImageModelRows(mode, modelId),
    modelId,
    mode,
    entitlements,
  );
}

export async function listAvailableVideoModelsForUser(
  userId: string,
): Promise<PublicVideoModelDto[]> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return getSeedVideoModelsForUser(userId, entitlements);
  }

  return listDatabaseVideoModelsForUserFromRows(
    await loadDatabaseVideoModelRows(),
    entitlements,
  );
}

export async function resolveVideoModelForUser(
  userId: string,
  modelId: string,
): Promise<ResolvedVideoModel> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return resolveSeedVideoModelForUser(userId, modelId, entitlements);
  }

  return resolveDatabaseVideoModelForUserFromRows(
    await loadDatabaseVideoModelRows(modelId),
    modelId,
    entitlements,
  );
}

export function listDatabaseImageModelsForUserFromRows(
  rows: DatabaseImageModelRow[],
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
): PublicImageModelDto[] {
  return groupResolvedDatabaseImageRows(rows, mode, entitlements)
    .filter((model) => model.entitlement.allowed)
    .map(toPublicImageModel);
}

export function listDatabaseChatModelsForUserFromRows(
  rows: DatabaseChatModelRow[],
  entitlements: ActiveUserEntitlement[],
): PublicChatModelDto[] {
  return groupResolvedDatabaseChatRows(rows, entitlements)
    .filter((model) => model.entitlement.allowed)
    .map(toPublicModel);
}

export function listDatabaseVideoModelsForUserFromRows(
  rows: DatabaseVideoModelRow[],
  entitlements: ActiveUserEntitlement[],
): PublicVideoModelDto[] {
  return groupResolvedDatabaseVideoRows(rows, entitlements)
    .filter((model) => model.entitlement.allowed)
    .map(toPublicModel);
}

export function resolveDatabaseChatModelForUserFromRows(
  rows: DatabaseChatModelRow[],
  modelId: string,
  entitlements: ActiveUserEntitlement[],
): ResolvedChatModel {
  const models = groupResolvedDatabaseChatRows(rows, entitlements, modelId);
  const model = models.find((item) => item.id === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }
  if (!model.entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return model;
}

export function resolveDatabaseImageModelForUserFromRows(
  rows: DatabaseImageModelRow[],
  modelId: string,
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
): ResolvedImageModel {
  const models = groupResolvedDatabaseImageRows(rows, mode, entitlements, modelId);
  const model = models.find((item) => item.id === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }
  if (!model.entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return model;
}

export function resolveDatabaseVideoModelForUserFromRows(
  rows: DatabaseVideoModelRow[],
  modelId: string,
  entitlements: ActiveUserEntitlement[],
): ResolvedVideoModel {
  const models = groupResolvedDatabaseVideoRows(rows, entitlements, modelId);
  const model = models.find((item) => item.id === modelId || item.model === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }
  if (!model.entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return model;
}

export function summarizeProviderCredentialReference(input: {
  providerType: AiProviderType;
  baseUrl: string | null;
  credentialEnvKey: string | null;
}): CredentialReferenceSummary {
  if (input.providerType === 'development') {
    return {
      label: 'not required',
      status: 'not_required',
      detail: 'development provider does not require credentials',
    };
  }

  const credentialEnvKey = input.credentialEnvKey?.trim() ?? '';
  const hasBaseUrl = Boolean(input.baseUrl?.trim());
  const hasCredentialKey = credentialEnvKey.length > 0;
  const hasCredentialValue = hasCredentialKey && Boolean(process.env[credentialEnvKey]);
  const missing: string[] = [];

  if (!hasBaseUrl) {
    missing.push('base URL');
  }

  if (!hasCredentialKey) {
    missing.push('credential environment key');
  } else if (!hasCredentialValue) {
    missing.push('environment variable value');
  }

  if (missing.length > 0) {
    return {
      label: hasCredentialKey ? credentialEnvKey : 'missing reference',
      status: 'invalid',
      detail: `missing ${joinHumanList(missing)}`,
    };
  }

  return {
    label: credentialEnvKey,
    status: 'valid',
    detail: 'credential reference configured',
  };
}

export function validateProviderTestConfiguration(input: {
  providerType: AiProviderType;
  baseUrl: string | null;
  credentialEnvKey: string | null;
  model: string | null;
}) {
  if (input.providerType === 'development') {
    return;
  }

  const missing: string[] = [];
  if (!input.baseUrl?.trim()) {
    missing.push('base URL');
  }
  if (!input.credentialEnvKey?.trim()) {
    missing.push('credential environment key');
  }
  if (!input.model?.trim()) {
    missing.push('model');
  }

  if (missing.length > 0) {
    throw new Error(`Provider test is missing configuration: ${joinHumanList(missing)}.`);
  }
}

export function normalizeDefaultChatTarget(input: {
  id: string;
  status: AiModelStatus;
  supportsChat: boolean;
  providerStatus: AiProviderStatus;
}) {
  if (
    input.status !== 'enabled' ||
    !input.supportsChat ||
    input.providerStatus !== 'enabled'
  ) {
    throw new Error('Selected model cannot become the default chat model.');
  }

  return input.id;
}

export function summarizeAdminAiConfigTestResult(input: {
  ok: boolean;
  elapsedMs: number;
  providerLabel: string;
  modelLabel: string;
  error?: string | null;
}): AdminAiConfigTestSummary {
  return {
    ok: input.ok,
    elapsedMs: input.elapsedMs,
    providerLabel: input.providerLabel,
    modelLabel: input.modelLabel,
    error: input.error ? input.error.trim().slice(0, 280) : null,
  };
}

export function buildModelStatusActions(
  modelId: string,
  status: AiModelStatus,
): AdminModelStatusAction[] {
  if (status === 'enabled') {
    return [
      {
        label: '停用',
        url: `/api/admin/ai-models/${modelId}/status`,
        body: { status: 'disabled' },
        successMessage: 'AI 模型已停用。',
        variant: 'destructive',
      },
    ];
  }

  return [
    {
      label: '启用',
      url: `/api/admin/ai-models/${modelId}/status`,
      body: { status: 'enabled' },
      successMessage: 'AI 模型已启用。',
    },
  ];
}

export async function updateAiModelStatus(input: {
  modelId: string;
  status: Extract<AiModelStatus, 'enabled' | 'disabled'>;
}): Promise<AdminAiModelRow> {
  const database = requireAiModelDatabase('AI model status mutation');

  if (!database) {
    const seed = seedModels.find((model) => model.id === input.modelId);
    if (!seed) {
      throw new Error('AI model was not found.');
    }

    return toAdminAiModelRow({
      model: {
        id: seed.id,
        providerId: seed.providerId,
        code: seed.code,
        name: seed.name,
        model: seed.model,
        executionProtocol: seed.executionProtocol,
        status: input.status,
        supportsChat: true,
        isDefaultChat: seed.isDefault,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
        isDefaultImage: false,
        isDefaultVideo: false,
        pricing: seed.pricing,
      },
      provider: seedProviders[0],
      requirements: seedRequirementForModel(seed),
    });
  }

  const [updated] = await database
    .update(schema.aiModels)
    .set({
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiModels.id, input.modelId))
    .returning();

  if (!updated) {
    throw new Error('AI model was not found.');
  }

  const rows = await loadAdminAiModelRows(input.modelId);
  const model = groupAdminModelRows(rows).find((item) => item.model.id === input.modelId);

  if (!model) {
    throw new Error('AI model was not found.');
  }

  return toAdminAiModelRow(model);
}

export async function setDefaultAiChatModel(input: {
  modelId: string;
}): Promise<AdminAiModelRow> {
  const database = requireAiModelDatabase('AI model default mutation');

  if (!database) {
    const seed = seedModels.find((model) => model.id === input.modelId);
    if (!seed) {
      throw new Error('AI model was not found.');
    }

    normalizeDefaultChatTarget({
      id: seed.id,
      status: 'enabled',
      supportsChat: true,
      providerStatus: 'enabled',
    });

    return toAdminAiModelRow({
      model: {
        id: seed.id,
        providerId: seed.providerId,
        code: seed.code,
        name: seed.name,
        model: seed.model,
        executionProtocol: seed.executionProtocol,
        status: 'enabled',
        supportsChat: true,
        isDefaultChat: true,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
        isDefaultImage: false,
        isDefaultVideo: false,
        pricing: seed.pricing,
      },
      provider: seedProviders[0],
      requirements: seedRequirementForModel(seed),
    });
  }

  const groups = groupAdminModelRows(await loadAdminAiModelRows(input.modelId));
  const target = groups.find((group) => group.model.id === input.modelId);

  if (!target) {
    throw new Error('AI model was not found.');
  }

  normalizeDefaultChatTarget({
    id: target.model.id,
    status: target.model.status,
    supportsChat: target.model.supportsChat,
    providerStatus: target.provider.status,
  });

  await database.transaction(async (tx) => {
    await tx
      .update(schema.aiModels)
      .set({
        isDefaultChat: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.aiModels.isDefaultChat, true));

    await tx
      .update(schema.aiModels)
      .set({
        isDefaultChat: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.aiModels.id, input.modelId));
  });

  const updatedGroups = groupAdminModelRows(await loadAdminAiModelRows(input.modelId));
  const updated = updatedGroups.find((group) => group.model.id === input.modelId);

  if (!updated) {
    throw new Error('AI model was not found.');
  }

  return toAdminAiModelRow(updated);
}

export async function createAiProvider(input: {
  code: string;
  name: string;
  providerType: Extract<AiProviderType, 'openai_compatible' | 'development'>;
  baseUrl: string | null;
  credentialEnvKey: string | null;
  status: Extract<AiProviderStatus, 'enabled' | 'disabled'>;
  billingRules?: ProviderBillingRuleConfig;
}): Promise<AdminAiProviderRow> {
  const database = requireAiModelDatabase('AI provider create');
  const trimmedBaseUrl = input.baseUrl?.trim() ?? null;
  const trimmedCredentialEnvKey = input.credentialEnvKey?.trim() ?? null;
  const billingRules = parseProviderBillingRules(input.billingRules);

  if (input.status === 'enabled') {
    validateProviderTestConfiguration({
      providerType: input.providerType,
      baseUrl: trimmedBaseUrl,
      credentialEnvKey: trimmedCredentialEnvKey,
      model: 'placeholder',
    });
  }

  if (!database) {
    return toAdminAiProviderRow({
      provider: {
        id: randomUUID(),
        code: input.code.trim(),
        name: input.name.trim(),
        providerType: input.providerType,
        status: input.status,
        baseUrl: trimmedBaseUrl,
        credentialEnvKey: trimmedCredentialEnvKey,
        metadata: providerMetadataWithBillingRules({}, billingRules),
      },
      models: [],
    });
  }

  const [created] = await database
    .insert(schema.aiProviders)
    .values({
      id: randomUUID(),
      code: input.code.trim(),
      name: input.name.trim(),
      providerType: input.providerType,
      status: input.status,
      baseUrl: trimmedBaseUrl,
      credentialEnvKey: trimmedCredentialEnvKey,
      metadata: providerMetadataWithBillingRules({}, billingRules),
    })
    .returning();

  return toAdminAiProviderRow({
    provider: created,
    models: [],
  });
}

export async function updateAiProviderStatus(input: {
  providerId: string;
  status: Extract<AiProviderStatus, 'enabled' | 'disabled'>;
}): Promise<AdminAiProviderRow> {
  const database = requireAiModelDatabase('AI provider status mutation');

  if (!database) {
    const seed = seedProviders.find((provider) => provider.id === input.providerId);
    if (!seed) {
      throw new Error('AI provider was not found.');
    }

    return toAdminAiProviderRow({
      provider: {
        ...seed,
        status: input.status,
      },
      models: getSeedAiModelAdminData().records.filter((record) => record.providerId === seed.id),
    });
  }

  const [updated] = await database
    .update(schema.aiProviders)
    .set({
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiProviders.id, input.providerId))
    .returning();

  if (!updated) {
    throw new Error('AI provider was not found.');
  }

  const groups = groupAdminModelRows(await loadAdminAiModelRows());
  return toAdminAiProviderRow({
    provider: updated,
    models: groups
      .filter((group) => group.provider.id === updated.id)
      .map(toAdminAiModelRow),
  });
}

export async function updateAiProvider(input: {
  providerId: string;
  code: string;
  name: string;
  providerType: Extract<AiProviderType, 'openai_compatible' | 'development'>;
  baseUrl: string | null;
  credentialEnvKey: string | null;
  status: Extract<AiProviderStatus, 'enabled' | 'disabled'>;
  billingRules?: ProviderBillingRuleConfig;
}): Promise<AdminAiProviderRow> {
  const database = requireAiModelDatabase('AI provider update');
  const trimmedBaseUrl = input.baseUrl?.trim() ?? null;
  const trimmedCredentialEnvKey = input.credentialEnvKey?.trim() ?? null;
  const billingRules = parseProviderBillingRules(input.billingRules);

  if (input.status === 'enabled') {
    validateProviderTestConfiguration({
      providerType: input.providerType,
      baseUrl: trimmedBaseUrl,
      credentialEnvKey: trimmedCredentialEnvKey,
      model: 'placeholder',
    });
  }

  if (!database) {
    const seed = seedProviders.find((provider) => provider.id === input.providerId);
    if (!seed) {
      throw new Error('AI provider was not found.');
    }

    return toAdminAiProviderRow({
      provider: {
        ...seed,
        code: input.code.trim(),
        name: input.name.trim(),
        providerType: input.providerType,
        status: input.status,
        baseUrl: trimmedBaseUrl,
        credentialEnvKey: trimmedCredentialEnvKey,
        metadata: providerMetadataWithBillingRules(seed.metadata, billingRules),
      },
      models: getSeedAiModelAdminData().records.filter((record) => record.providerId === seed.id),
    });
  }

  const [existing] = await database
    .select({ metadata: schema.aiProviders.metadata })
    .from(schema.aiProviders)
    .where(eq(schema.aiProviders.id, input.providerId))
    .limit(1);

  const [updated] = await database
    .update(schema.aiProviders)
    .set({
      code: input.code.trim(),
      name: input.name.trim(),
      providerType: input.providerType,
      status: input.status,
      baseUrl: trimmedBaseUrl,
      credentialEnvKey: trimmedCredentialEnvKey,
      metadata: providerMetadataWithBillingRules(existing?.metadata ?? {}, billingRules),
      updatedAt: new Date(),
    })
    .where(eq(schema.aiProviders.id, input.providerId))
    .returning();

  if (!updated) {
    throw new Error('AI provider was not found.');
  }

  const groups = groupAdminModelRows(await loadAdminAiModelRows());
  return toAdminAiProviderRow({
    provider: updated,
    models: groups
      .filter((group) => group.provider.id === updated.id)
      .map(toAdminAiModelRow),
  });
}

export async function createAiModel(input: {
  providerId: string;
  code: string;
  name: string;
  model: string;
  status: Extract<AiModelStatus, 'enabled' | 'disabled'>;
  executionProtocol: AiModelExecutionProtocol;
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
}): Promise<AdminAiModelRow> {
  const database = requireAiModelDatabase('AI model create');
  validateModelCapabilityProtocol(input);

  if (!database) {
    const provider = seedProviders.find((item) => item.id === input.providerId);
    if (!provider) {
      throw new Error('AI provider was not found.');
    }

    // Check if code already exists in seed models
    const trimmedCode = input.code.trim();
    const existingModel = seedModels.find(
      (m) => m.providerId === input.providerId && m.code === trimmedCode
    );
    if (existingModel) {
      throw new Error(`AI model with code "${trimmedCode}" already exists.`);
    }

    return toAdminAiModelRow({
      model: {
        id: randomUUID(),
        providerId: input.providerId,
        code: trimmedCode,
        name: input.name.trim(),
        model: input.model.trim(),
        executionProtocol: input.executionProtocol,
        status: input.status,
        supportsChat: input.supportsChat,
        isDefaultChat: false,
        supportsImageGeneration: input.supportsImageGeneration,
        supportsImageEdit: input.supportsImageEdit,
        supportsImageUpscale: input.supportsImageUpscale,
        supportsVideoGeneration: input.supportsVideoGeneration,
        isDefaultImage: false,
        isDefaultVideo: false,
        pricing: defaultPricing,
      },
      provider,
      requirements: [],
    });
  }

  // Check if code already exists in database
  const trimmedCode = input.code.trim();
  const existingModel = await database
    .select({ id: schema.aiModels.id })
    .from(schema.aiModels)
    .where(eq(schema.aiModels.code, trimmedCode))
    .limit(1);

  if (existingModel.length > 0) {
    throw new Error(`AI model with code "${trimmedCode}" already exists.`);
  }

  const [created] = await database
    .insert(schema.aiModels)
    .values({
      id: randomUUID(),
      providerId: input.providerId,
      code: input.code.trim(),
      name: input.name.trim(),
      model: input.model.trim(),
      executionProtocol: input.executionProtocol,
      status: input.status,
      supportsChat: input.supportsChat,
      isDefaultChat: false,
      supportsImageGeneration: input.supportsImageGeneration,
      supportsImageEdit: input.supportsImageEdit,
      supportsImageUpscale: input.supportsImageUpscale,
      supportsVideoGeneration: input.supportsVideoGeneration,
      isDefaultImage: false,
      isDefaultVideo: false,
      sortOrder: 0,
      pricing: defaultPricing,
      metadata: {},
    })
    .returning();

  const groups = groupAdminModelRows(await loadAdminAiModelRows(created.id));
  const row = groups.find((group) => group.model.id === created.id);
  if (!row) {
    throw new Error('AI model was not found.');
  }

  return toAdminAiModelRow(row);
}

export async function updateAiModel(input: {
  modelId: string;
  providerId: string;
  code: string;
  name: string;
  model: string;
  status: Extract<AiModelStatus, 'enabled' | 'disabled'>;
  executionProtocol: AiModelExecutionProtocol;
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
}): Promise<AdminAiModelRow> {
  const database = requireAiModelDatabase('AI model update');
  validateModelCapabilityProtocol(input);

  if (!database) {
    const provider = seedProviders.find((item) => item.id === input.providerId);
    if (!provider) {
      throw new Error('AI provider was not found.');
    }

    return toAdminAiModelRow({
      model: {
        id: input.modelId,
        providerId: input.providerId,
        code: input.code.trim(),
        name: input.name.trim(),
        model: input.model.trim(),
        executionProtocol: input.executionProtocol,
        status: input.status,
        supportsChat: input.supportsChat,
        isDefaultChat: input.modelId === 'seed-model-free',
        supportsImageGeneration: input.supportsImageGeneration,
        supportsImageEdit: input.supportsImageEdit,
        supportsImageUpscale: input.supportsImageUpscale,
        supportsVideoGeneration: input.supportsVideoGeneration,
        isDefaultImage: false,
        isDefaultVideo: false,
        pricing: defaultPricing,
      },
      provider,
      requirements: [],
    });
  }

  const [updated] = await database
    .update(schema.aiModels)
    .set({
      providerId: input.providerId,
      code: input.code.trim(),
      name: input.name.trim(),
      model: input.model.trim(),
      executionProtocol: input.executionProtocol,
      status: input.status,
      supportsChat: input.supportsChat,
      supportsImageGeneration: input.supportsImageGeneration,
      supportsImageEdit: input.supportsImageEdit,
      supportsImageUpscale: input.supportsImageUpscale,
      supportsVideoGeneration: input.supportsVideoGeneration,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiModels.id, input.modelId))
    .returning();

  if (!updated) {
    throw new Error('AI model was not found.');
  }

  const groups = groupAdminModelRows(await loadAdminAiModelRows(updated.id));
  const row = groups.find((group) => group.model.id === updated.id);
  if (!row) {
    throw new Error('AI model was not found.');
  }

  return toAdminAiModelRow(row);
}

export async function testAiProviderConfiguration(input: {
  providerId: string;
  modelId: string;
  prompt?: string;
  createAgentRunService?: AdminAiChatLoopAgentRunServiceFactory;
}): Promise<AdminAiConfigTestSummary> {
  if (input.prompt?.trim()) {
    if (!input.createAgentRunService) {
      throw new Error('Agent run service factory is required for chat loop tests.');
    }
    return runAdminAiChatLoopTest({
      modelId: input.modelId,
      prompt: input.prompt,
      createAgentRunService: input.createAgentRunService,
    });
  }

  const model = await resolveAdminTestModel(input.modelId, input.providerId);
  validateProviderTestConfiguration({
    providerType: model.providerType,
    baseUrl: model.baseUrl,
    credentialEnvKey: model.credentialEnvKey,
    model: model.model,
  });

  const adapter = createChatProviderAdapter(model);
  const startedAt = Date.now();

  try {
    await adapter.runChat({
      runId: `admin-provider-test:${input.providerId}`,
      userId: 'admin-config-test',
      model,
      messages: [{ role: 'user', content: 'ping' }],
    });

    return summarizeAdminAiConfigTestResult({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      providerLabel: model.providerName,
      modelLabel: model.name,
    });
  } catch (error) {
    return summarizeAdminAiConfigTestResult({
      ok: false,
      elapsedMs: Date.now() - startedAt,
      providerLabel: model.providerName,
      modelLabel: model.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function testAiModelConfiguration(input: {
  modelId: string;
  prompt?: string;
  createAgentRunService?: AdminAiChatLoopAgentRunServiceFactory;
}): Promise<AdminAiConfigTestSummary> {
  const prompt = input.prompt?.trim();
  if (prompt) {
    if (!input.createAgentRunService) {
      throw new Error('Agent run service factory is required for chat loop tests.');
    }
    return runAdminAiChatLoopTest({
      modelId: input.modelId,
      prompt,
      createAgentRunService: input.createAgentRunService,
    });
  }

  const model = await resolveAdminTestModel(input.modelId);
  validateProviderTestConfiguration({
    providerType: model.providerType,
    baseUrl: model.baseUrl,
    credentialEnvKey: model.credentialEnvKey,
    model: model.model,
  });

  const adapter = createChatProviderAdapter(model);
  const startedAt = Date.now();

  try {
    await adapter.runChat({
      runId: `admin-model-test:${input.modelId}`,
      userId: 'admin-config-test',
      model,
      messages: [{ role: 'user', content: 'ping' }],
    });

    return summarizeAdminAiConfigTestResult({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      providerLabel: model.providerName,
      modelLabel: model.name,
    });
  } catch (error) {
    return summarizeAdminAiConfigTestResult({
      ok: false,
      elapsedMs: Date.now() - startedAt,
      providerLabel: model.providerName,
      modelLabel: model.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runAdminAiChatLoopTest(input: {
  modelId: string;
  prompt: string;
  createAgentRunService: AdminAiChatLoopAgentRunServiceFactory;
}): Promise<AdminAiChatLoopTestResult> {
  const model = await resolveAdminTestModel(input.modelId);
  validateProviderTestConfiguration({
    providerType: model.providerType,
    baseUrl: model.baseUrl,
    credentialEnvKey: model.credentialEnvKey,
    model: model.model,
  });

  const repository = getAgentRunRepository();
  const service = input.createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('chat loop test should not use non-chat runtime');
      },
    },
    resolveChatModelForUser: async (_userId, modelId) => {
      if (modelId !== model.id) {
        throw new Error('Requested test model does not match resolved admin model.');
      }
      return model;
    },
    assertCanAffordMinimum: async () => {},
  });
  const startedAt = Date.now();
  const { run } = await service.createAndRunAgentRun({
    userId: adminAiLoopTestUserId,
    taskType: 'chat',
    prompt: input.prompt.trim(),
    modelId: model.id,
    input: { source: 'admin-ai-loop-test' },
  });

  const detail = await waitForAdminTestRunCompletion(repository, run.id, adminAiLoopTestUserId);
  const ok = detail.run.status === 'succeeded';

  return {
    ok,
    elapsedMs: Date.now() - startedAt,
    providerLabel: model.providerName,
    modelLabel: model.name,
    prompt: input.prompt.trim(),
    run: detail.run,
    events: detail.events,
    error: ok ? null : detail.run.errorMessage ?? '闭环测试未成功完成。',
  };
}

async function waitForAdminTestRunCompletion(
  repository: ReturnType<typeof getAgentRunRepository>,
  runId: string,
  userId: string,
) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const detail = await repository.getRunDetailForUser(runId, userId);
    if (detail && detail.run.status !== 'queued' && detail.run.status !== 'running') {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const detail = await repository.getRunDetailForUser(runId, userId);
  if (detail) {
    return detail;
  }

  throw new Error('闭环测试超时，且未能读取测试 run 详情。');
}

export function getSeedAiModelAdminData(): AdminAiModelData {
  const chatRecords = seedModels.map((model) =>
    toAdminAiModelRow({
      model: {
        id: model.id,
        providerId: model.providerId,
        code: model.code,
        name: model.name,
        model: model.model,
        executionProtocol: model.executionProtocol,
        status: 'enabled',
        supportsChat: true,
        isDefaultChat: model.isDefault,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
        isDefaultImage: false,
        isDefaultVideo: false,
        pricing: model.pricing,
      },
      provider: seedProviders[0],
      requirements: seedRequirementForModel(model),
    }),
  );
  const imageRecords = seedImageModels.map((model) =>
    toAdminAiModelRow({
      model: {
        id: model.id,
        providerId: model.providerId,
        code: model.code,
        name: model.name,
        model: model.model,
        executionProtocol: model.executionProtocol,
        status: 'enabled',
        supportsChat: false,
        isDefaultChat: false,
        supportsImageGeneration: model.supportedModes.includes('generate'),
        supportsImageEdit: model.supportedModes.includes('edit'),
        supportsImageUpscale: model.supportedModes.includes('upscale'),
        supportsVideoGeneration: false,
        isDefaultImage: model.isDefault,
        isDefaultVideo: false,
        pricing: model.pricing,
      },
      provider: seedProviders[0],
      requirements: seedRequirementForModel(model),
    }),
  );
  const records = [...chatRecords, ...imageRecords];

  const providers = seedProviders.map((provider) =>
    toAdminAiProviderRow({
      provider,
      models: records.filter((record) => record.providerId === provider.id),
    }),
  );

  return buildAdminAiModelData('seed', records, providers);
}

export async function getAdminAiModels(): Promise<AdminAiModelData> {
  const database = ensureAdminReadSource('AI models');

  if (!database) {
    return getSeedAiModelAdminData();
  }

  const groupedModels = groupAdminModelRows(await loadAdminAiModelRows());
  const records = groupedModels.map(toAdminAiModelRow);
  const providers = buildAdminProviderRows(records, await loadAdminProviderRows());

  return buildAdminAiModelData('database', records, providers);
}

function seedRequirementForModel(model: ResolvedChatModel): ModelEntitlementRequirement[] {
  return [
    {
      type: model.entitlement.basis,
      value: model.entitlement.value,
      label: model.entitlement.label,
    },
  ];
}

function toPublicModel(model: ResolvedChatModel): PublicChatModelDto {
  return {
    id: model.id,
    code: model.code,
    name: model.name,
    model: model.model,
    providerName: model.providerName,
    isDefault: model.isDefault,
    entitlementLabel: model.entitlement.label,
    pricingSummary: pricingSummary(model.pricing),
  };
}

function toPublicImageModel(model: ResolvedImageModel): PublicImageModelDto {
  return {
    ...toPublicModel(model),
    supportedModes: model.supportedModes,
    supportsWorkflowStoryboardTemplate: supportsStoryboardTemplateProvider({
      providerCode: model.providerCode,
      providerName: model.providerName,
      baseUrl: model.baseUrl,
      model: model.model,
    }),
  };
}

function parsePricing(value: Record<string, unknown>): AiModelPricing {
  const unit = value.unit === 'token' ? value.unit : defaultPricing.unit;
  const promptCreditsPer1k = parseNonNegativeNumber(
    value.promptCreditsPer1k,
    defaultPricing.promptCreditsPer1k,
  );
  const completionCreditsPer1k = parseNonNegativeNumber(
    value.completionCreditsPer1k,
    defaultPricing.completionCreditsPer1k,
  );
  const minimumCredits = parseNonNegativeInteger(
    value.minimumCredits,
    defaultPricing.minimumCredits,
  );

  return {
    unit,
    promptCreditsPer1k,
    completionCreditsPer1k,
    minimumCredits,
  };
}

function parseNonNegativeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseNonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function pricingSummary(pricing: AiModelPricing) {
  const prompt = formatCreditRate(pricing.promptCreditsPer1k);
  const completion = formatCreditRate(pricing.completionCreditsPer1k);
  const minimum = `${pricing.minimumCredits} credit${pricing.minimumCredits === 1 ? '' : 's'} minimum`;

  return `${minimum} · prompt ${prompt}/1k · completion ${completion}/1k`;
}

function resolvePricingForTask(
  legacyPricing: AiModelPricing,
  billingRules: ProviderBillingRuleConfig,
  taskType: 'chat' | 'image' | 'video',
): AiModelPricing {
  if (taskType === 'chat' && billingRules.chat) {
    return {
      unit: 'token',
      promptCreditsPer1k: billingRules.chat.inputCreditsPer1k,
      completionCreditsPer1k: billingRules.chat.outputCreditsPer1k,
      minimumCredits: billingRules.chat.minimumCredits,
    };
  }

  if (taskType === 'image' && billingRules.image) {
    return {
      unit: 'token',
      promptCreditsPer1k: 0,
      completionCreditsPer1k: 0,
      minimumCredits: billingRules.image.minimumCredits,
    };
  }

  if (taskType === 'video' && billingRules.video) {
    return {
      unit: 'token',
      promptCreditsPer1k: 0,
      completionCreditsPer1k: 0,
      minimumCredits: billingRules.video.minimumCredits,
    };
  }

  return legacyPricing;
}

function groupResolvedRows(
  rows: ChatModelRow[],
  entitlements: ActiveUserEntitlement[],
  taskType: 'chat' | 'image' | 'video' = 'chat',
): ResolvedChatModel[] {
  const grouped = new Map<
    string,
    {
      model: ChatModelRow['model'];
      provider: ChatModelRow['provider'];
      requirements: ModelEntitlementRequirement[];
    }
  >();

  for (const row of rows) {
    const existing = grouped.get(row.model.id);
    const group =
      existing ??
      {
        model: row.model,
        provider: row.provider,
        requirements: [] as ModelEntitlementRequirement[],
      };

    if (row.requirement) {
      group.requirements.push({
        type: row.requirement.requirementType,
        value: row.requirement.requirementValue,
        label: row.requirement.label,
      });
    }

    grouped.set(row.model.id, group);
  }

  return Array.from(grouped.values()).map(({ model, provider, requirements }) => {
    const billingRules = parseProviderBillingRules(provider.metadata.billingRules);
    const pricing = resolvePricingForTask(parsePricing(model.pricing), billingRules, taskType);
    const entitlement = evaluateModelEntitlement({ requirements, entitlements });

    return {
      id: model.id,
      code: model.code,
      name: model.name,
      providerName: provider.name,
      isDefault: model.isDefaultChat,
      entitlementLabel: entitlement.label,
      pricingSummary: pricingSummary(pricing),
      providerId: provider.id,
      providerCode: provider.code,
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      credentialEnvKey: provider.credentialEnvKey,
      model: model.model,
      executionProtocol: model.executionProtocol,
      pricing,
      billingRules,
      entitlement,
    };
  });
}

function modelSupportsImageMode(
  model: Pick<
    typeof schema.aiModels.$inferSelect,
    'supportsImageGeneration' | 'supportsImageEdit' | 'supportsImageUpscale'
  >,
  mode: ImageModelMode,
) {
  return mode === 'generate'
    ? model.supportsImageGeneration
    : mode === 'edit'
      ? model.supportsImageEdit
      : model.supportsImageUpscale;
}

function modelSupportsAnyImageMode(
  model: Pick<
    typeof schema.aiModels.$inferSelect,
    'supportsImageGeneration' | 'supportsImageEdit' | 'supportsImageUpscale'
  >,
) {
  return model.supportsImageGeneration || model.supportsImageEdit || model.supportsImageUpscale;
}

function supportedImageModesForModel(
  model: Pick<
    typeof schema.aiModels.$inferSelect,
    'supportsImageGeneration' | 'supportsImageEdit' | 'supportsImageUpscale'
  >,
): ImageModelMode[] {
  const modes: ImageModelMode[] = [];
  if (model.supportsImageGeneration) {
    modes.push('generate');
  }
  if (model.supportsImageEdit) {
    modes.push('edit');
  }
  if (model.supportsImageUpscale) {
    modes.push('upscale');
  }

  return modes;
}

function groupResolvedImageRows(
  rows: ImageModelRow[],
  entitlements: ActiveUserEntitlement[],
): ResolvedImageModel[] {
  return groupResolvedRows(rows, entitlements, 'image').map((model) => ({
    ...model,
    isDefault: rows.find((row) => row.model.id === model.id)?.model.isDefaultImage ?? false,
    supportedModes: supportedImageModesForModel(
      rows.find((row) => row.model.id === model.id)?.model ?? {
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
      },
    ),
  }));
}

function groupResolvedVideoRows(
  rows: VideoModelRow[],
  entitlements: ActiveUserEntitlement[],
): ResolvedVideoModel[] {
  return groupResolvedRows(rows, entitlements, 'video').map((model) => ({
    ...model,
    isDefault: rows.find((row) => row.model.id === model.id)?.model.isDefaultVideo ?? false,
    supportsVideoGeneration: true,
  }));
}

function groupResolvedDatabaseChatRows(
  rows: DatabaseChatModelRow[],
  entitlements: ActiveUserEntitlement[],
  modelId?: string,
): ResolvedChatModel[] {
  const availableRows = rows.filter(
    (row) =>
      (!modelId || row.model.id === modelId) &&
      row.model.status === 'enabled' &&
      row.model.supportsChat &&
      isChatExecutionProtocol(row.model.executionProtocol) &&
      !modelSupportsAnyImageMode(row.model) &&
      !row.model.supportsVideoGeneration &&
      row.provider.status === 'enabled',
  );

  return groupResolvedRows(availableRows as ChatModelRow[], entitlements, 'chat');
}

function groupResolvedDatabaseImageRows(
  rows: DatabaseImageModelRow[],
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
  modelId?: string,
): ResolvedImageModel[] {
  const availableRows = rows.filter(
    (row) =>
      (!modelId || row.model.id === modelId) &&
      row.model.status === 'enabled' &&
      row.provider.status === 'enabled' &&
      isImageExecutionProtocol(row.model.executionProtocol) &&
      modelSupportsImageMode(row.model, mode),
  );

  return groupResolvedImageRows(availableRows as ImageModelRow[], entitlements);
}

function groupResolvedDatabaseVideoRows(
  rows: DatabaseVideoModelRow[],
  entitlements: ActiveUserEntitlement[],
  modelId?: string,
): ResolvedVideoModel[] {
  const availableRows = rows.filter(
    (row) =>
      (!modelId || row.model.id === modelId || row.model.model === modelId) &&
      row.model.status === 'enabled' &&
      row.provider.status === 'enabled' &&
      isVideoExecutionProtocol(row.model.executionProtocol) &&
      row.model.supportsVideoGeneration,
  );

  return groupResolvedVideoRows(availableRows as VideoModelRow[], entitlements);
}

async function loadDatabaseChatModelRows(modelId?: string): Promise<ChatModelRow[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const modelFilter = modelId
    ? isDatabaseUuid(modelId)
      ? eq(schema.aiModels.id, modelId)
      : or(eq(schema.aiModels.model, modelId), eq(schema.aiModels.code, modelId))
    : undefined;

  const where = modelFilter
    ? and(
        modelFilter,
        eq(schema.aiModels.status, 'enabled'),
        eq(schema.aiModels.supportsChat, true),
        eq(schema.aiModels.executionProtocol, 'chat_openai_compatible'),
        eq(schema.aiModels.supportsImageGeneration, false),
        eq(schema.aiModels.supportsImageEdit, false),
        eq(schema.aiModels.supportsImageUpscale, false),
        eq(schema.aiModels.supportsVideoGeneration, false),
        eq(schema.aiProviders.status, 'enabled'),
      )
    : and(
        eq(schema.aiModels.status, 'enabled'),
        eq(schema.aiModels.supportsChat, true),
        eq(schema.aiModels.executionProtocol, 'chat_openai_compatible'),
        eq(schema.aiModels.supportsImageGeneration, false),
        eq(schema.aiModels.supportsImageEdit, false),
        eq(schema.aiModels.supportsImageUpscale, false),
        eq(schema.aiModels.supportsVideoGeneration, false),
        eq(schema.aiProviders.status, 'enabled'),
      );

  return db
    .select({
      model: schema.aiModels,
      provider: schema.aiProviders,
      requirement: schema.aiModelEntitlementRequirements,
    })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiProviders.id, schema.aiModels.providerId))
    .leftJoin(
      schema.aiModelEntitlementRequirements,
      eq(schema.aiModelEntitlementRequirements.modelId, schema.aiModels.id),
    )
    .where(where)
    .orderBy(asc(schema.aiModels.sortOrder), asc(schema.aiModels.createdAt));
}

async function loadDatabaseImageModelRows(
  mode: ImageModelMode,
  modelId?: string,
): Promise<ImageModelRow[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const modeColumn =
    mode === 'generate'
      ? schema.aiModels.supportsImageGeneration
      : mode === 'edit'
        ? schema.aiModels.supportsImageEdit
        : schema.aiModels.supportsImageUpscale;
  const where = modelId
    ? and(
        eq(schema.aiModels.id, modelId),
        eq(schema.aiModels.status, 'enabled'),
        eq(modeColumn, true),
        eq(schema.aiModels.executionProtocol, 'image_openai_compatible'),
        eq(schema.aiProviders.status, 'enabled'),
      )
    : and(
        eq(schema.aiModels.status, 'enabled'),
        eq(modeColumn, true),
        eq(schema.aiModels.executionProtocol, 'image_openai_compatible'),
        eq(schema.aiProviders.status, 'enabled'),
      );

  return db
    .select({
      model: schema.aiModels,
      provider: schema.aiProviders,
      requirement: schema.aiModelEntitlementRequirements,
    })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiProviders.id, schema.aiModels.providerId))
    .leftJoin(
      schema.aiModelEntitlementRequirements,
      eq(schema.aiModelEntitlementRequirements.modelId, schema.aiModels.id),
    )
    .where(where)
    .orderBy(asc(schema.aiModels.sortOrder), asc(schema.aiModels.createdAt));
}

async function loadDatabaseVideoModelRows(modelId?: string): Promise<VideoModelRow[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const where = modelId
    ? and(
        isDatabaseUuid(modelId)
          ? or(eq(schema.aiModels.id, modelId), eq(schema.aiModels.model, modelId))
          : eq(schema.aiModels.model, modelId),
        eq(schema.aiModels.status, 'enabled'),
        eq(schema.aiModels.supportsVideoGeneration, true),
        eq(schema.aiModels.executionProtocol, 'video_task_polling'),
        eq(schema.aiProviders.status, 'enabled'),
      )
    : and(
        eq(schema.aiModels.status, 'enabled'),
        eq(schema.aiModels.supportsVideoGeneration, true),
        eq(schema.aiModels.executionProtocol, 'video_task_polling'),
        eq(schema.aiProviders.status, 'enabled'),
      );

  return db
    .select({
      model: schema.aiModels,
      provider: schema.aiProviders,
      requirement: schema.aiModelEntitlementRequirements,
    })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiProviders.id, schema.aiModels.providerId))
    .leftJoin(
      schema.aiModelEntitlementRequirements,
      eq(schema.aiModelEntitlementRequirements.modelId, schema.aiModels.id),
    )
    .where(where)
    .orderBy(asc(schema.aiModels.sortOrder), asc(schema.aiModels.createdAt));
}

type AdminAiModelGroup = {
  model: Pick<
    typeof schema.aiModels.$inferSelect,
    | 'id'
    | 'providerId'
    | 'code'
    | 'name'
    | 'model'
    | 'executionProtocol'
    | 'status'
    | 'supportsChat'
    | 'isDefaultChat'
    | 'supportsImageGeneration'
    | 'supportsImageEdit'
    | 'supportsImageUpscale'
    | 'supportsVideoGeneration'
    | 'isDefaultImage'
    | 'isDefaultVideo'
    | 'pricing'
  >;
  provider: Pick<
    typeof schema.aiProviders.$inferSelect,
    | 'id'
    | 'code'
    | 'name'
    | 'providerType'
    | 'status'
    | 'baseUrl'
    | 'credentialEnvKey'
    | 'metadata'
  >;
  requirements: ModelEntitlementRequirement[];
};

type AdminAiModelRowSource = {
  model: AdminAiModelGroup['model'];
  provider: AdminAiModelGroup['provider'];
  requirement: typeof schema.aiModelEntitlementRequirements.$inferSelect | null;
};

function requireAiModelDatabase(operation: string) {
  if (!db || !process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`DATABASE_URL is required for ${operation}.`);
    }

    return null;
  }

  return db;
}

function joinHumanList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? '';
  }

  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function formatCreditRate(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function summarizeRequirements(requirements: ModelEntitlementRequirement[]) {
  if (requirements.length === 0) {
    return 'Free';
  }

  return requirements.map((requirement) => requirement.label).join(' · ');
}

function providerMetadataWithBillingRules(
  metadata: Record<string, unknown>,
  billingRules: ProviderBillingRuleConfig,
) {
  return {
    ...metadata,
    billingRules,
  };
}

function toAdminAiModelRow(group: AdminAiModelGroup): AdminAiModelRow {
  const pricing = parsePricing(group.model.pricing);

  return {
    id: group.model.id,
    providerId: group.provider.id,
    providerName: group.provider.name,
    providerCode: group.provider.code,
    providerType: group.provider.providerType,
    providerStatus: group.provider.status,
    code: group.model.code,
    name: group.model.name,
    model: group.model.model,
    executionProtocol: group.model.executionProtocol,
    status: group.model.status,
    supportsChat: group.model.supportsChat,
    isDefaultChat: group.model.isDefaultChat,
    supportsImageGeneration: group.model.supportsImageGeneration,
    supportsImageEdit: group.model.supportsImageEdit,
    supportsImageUpscale: group.model.supportsImageUpscale,
    supportsVideoGeneration: group.model.supportsVideoGeneration,
    isDefaultImage: group.model.isDefaultImage,
    isDefaultVideo: group.model.isDefaultVideo,
    entitlementSummary: summarizeRequirements(group.requirements),
    pricingSummary: pricingSummary(pricing),
    credential: summarizeProviderCredentialReference({
      providerType: group.provider.providerType,
      baseUrl: group.provider.baseUrl,
      credentialEnvKey: group.provider.credentialEnvKey,
    }),
  };
}

function toAdminAiProviderRow(input: {
  provider: AdminAiModelGroup['provider'];
  models: AdminAiModelRow[];
}): AdminAiProviderRow {
  return {
    id: input.provider.id,
    code: input.provider.code,
    name: input.provider.name,
    providerType: input.provider.providerType,
    status: input.provider.status,
    baseUrlLabel: input.provider.baseUrl?.trim() ? input.provider.baseUrl : 'not configured',
    credential: summarizeProviderCredentialReference({
      providerType: input.provider.providerType,
      baseUrl: input.provider.baseUrl,
      credentialEnvKey: input.provider.credentialEnvKey,
    }),
    modelCount: input.models.length,
    enabledModelCount: input.models.filter((model) => model.status === 'enabled').length,
    chatModelCount: input.models.filter((model) => model.supportsChat).length,
    videoModelCount: input.models.filter((model) => model.supportsVideoGeneration).length,
    billingRules: parseProviderBillingRules(input.provider.metadata.billingRules),
  };
}

function buildAdminProviderRows(
  records: AdminAiModelRow[],
  providers: AdminAiModelGroup['provider'][],
) {
  const providerById = new Map<string, AdminAiModelGroup['provider']>();

  for (const provider of providers) {
    providerById.set(provider.id, provider);
  }

  return Array.from(providerById.values()).map((provider) =>
    toAdminAiProviderRow({
      provider,
      models: records.filter((record) => record.providerId === provider.id),
    }),
  );
}

function buildAdminAiModelData(
  source: AdminModuleData<AdminAiModelRow>['source'],
  records: AdminAiModelRow[],
  providers: AdminAiProviderRow[],
): AdminAiModelData {
  const invalidCredentialCount = providers.filter(
    (provider) => provider.credential.status === 'invalid',
  ).length;

  return {
    source,
    metrics: [
      {
        label: '供应商',
        value: String(providers.length),
        hint: source === 'database' ? '数据库' : 'seed',
        tone: 'info',
      },
      {
        label: '模型',
        value: String(records.length),
        hint: `${records.filter((record) => record.status === 'enabled').length} enabled`,
        tone: 'success',
      },
      {
        label: 'Chat 支持',
        value: String(records.filter((record) => record.supportsChat).length),
        hint: 'supports_chat',
        tone: 'info',
      },
      {
        label: 'Image 支持',
        value: String(
          records.filter(
            (record) =>
              record.supportsImageGeneration ||
              record.supportsImageEdit ||
              record.supportsImageUpscale,
          ).length,
        ),
        hint: 'image capabilities',
        tone: 'info',
      },
      {
        label: 'Video 支持',
        value: String(records.filter((record) => record.supportsVideoGeneration).length),
        hint: 'supports_video',
        tone: 'info',
      },
      {
        label: '凭据检查',
        value: String(invalidCredentialCount),
        hint: invalidCredentialCount > 0 ? 'needs attention' : 'valid',
        tone: invalidCredentialCount > 0 ? 'danger' : 'success',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      {
        label: 'Enabled',
        value: 'enabled',
        count: records.filter((record) => record.status === 'enabled').length,
      },
      {
        label: 'Disabled',
        value: 'disabled',
        count: records.filter((record) => record.status === 'disabled').length,
      },
      {
        label: 'Chat',
        value: 'chat',
        count: records.filter((record) => record.supportsChat).length,
      },
      {
        label: 'Image',
        value: 'image',
        count: records.filter(
          (record) =>
            record.supportsImageGeneration ||
            record.supportsImageEdit ||
            record.supportsImageUpscale,
        ).length,
      },
      {
        label: 'Video',
        value: 'video',
        count: records.filter((record) => record.supportsVideoGeneration).length,
      },
      {
        label: 'Default',
        value: 'default',
        count: records.filter((record) => record.isDefaultChat).length,
      },
    ],
    records,
    providers,
  };
}

function groupAdminModelRows(rows: AdminAiModelRowSource[]): AdminAiModelGroup[] {
  const grouped = new Map<string, AdminAiModelGroup>();

  for (const row of rows) {
    const group =
      grouped.get(row.model.id) ??
      ({
        model: row.model,
        provider: row.provider,
        requirements: [],
      } satisfies AdminAiModelGroup);

    if (row.requirement) {
      group.requirements.push({
        type: row.requirement.requirementType,
        value: row.requirement.requirementValue,
        label: row.requirement.label,
      });
    }

    grouped.set(row.model.id, group);
  }

  return Array.from(grouped.values());
}

async function loadAdminAiModelRows(modelId?: string): Promise<AdminAiModelRowSource[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const baseQuery = db
    .select({
      model: {
        id: schema.aiModels.id,
        providerId: schema.aiModels.providerId,
        code: schema.aiModels.code,
        name: schema.aiModels.name,
        model: schema.aiModels.model,
        executionProtocol: schema.aiModels.executionProtocol,
        status: schema.aiModels.status,
        supportsChat: schema.aiModels.supportsChat,
        isDefaultChat: schema.aiModels.isDefaultChat,
        supportsImageGeneration: schema.aiModels.supportsImageGeneration,
        supportsImageEdit: schema.aiModels.supportsImageEdit,
        supportsImageUpscale: schema.aiModels.supportsImageUpscale,
        supportsVideoGeneration: schema.aiModels.supportsVideoGeneration,
        isDefaultImage: schema.aiModels.isDefaultImage,
        isDefaultVideo: schema.aiModels.isDefaultVideo,
        pricing: schema.aiModels.pricing,
      },
      provider: {
        id: schema.aiProviders.id,
        code: schema.aiProviders.code,
        name: schema.aiProviders.name,
        providerType: schema.aiProviders.providerType,
        status: schema.aiProviders.status,
        baseUrl: schema.aiProviders.baseUrl,
        credentialEnvKey: schema.aiProviders.credentialEnvKey,
        metadata: schema.aiProviders.metadata,
      },
      requirement: schema.aiModelEntitlementRequirements,
    })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiProviders.id, schema.aiModels.providerId))
    .leftJoin(
      schema.aiModelEntitlementRequirements,
      eq(schema.aiModelEntitlementRequirements.modelId, schema.aiModels.id),
    );

  const rows = modelId
    ? await baseQuery
        .where(eq(schema.aiModels.id, modelId))
        .orderBy(asc(schema.aiModels.sortOrder), asc(schema.aiModels.createdAt))
    : await baseQuery.orderBy(desc(schema.aiModels.updatedAt), asc(schema.aiModels.sortOrder));

  return rows;
}

async function loadAdminProviderRows(): Promise<AdminAiModelGroup['provider'][]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  return db
    .select({
      id: schema.aiProviders.id,
      code: schema.aiProviders.code,
      name: schema.aiProviders.name,
      providerType: schema.aiProviders.providerType,
      status: schema.aiProviders.status,
      baseUrl: schema.aiProviders.baseUrl,
      credentialEnvKey: schema.aiProviders.credentialEnvKey,
      metadata: schema.aiProviders.metadata,
    })
    .from(schema.aiProviders)
    .orderBy(desc(schema.aiProviders.updatedAt), asc(schema.aiProviders.createdAt));
}

async function resolveAdminTestModel(modelId: string, providerId?: string): Promise<ResolvedChatModel> {
  if (!db || !process.env.DATABASE_URL) {
    const seed = seedModels.find((item) => item.id === modelId);
    if (!seed) {
      throw new Error('AI model was not found.');
    }
    if (providerId && seed.providerId !== providerId) {
      throw new Error('AI provider and model do not match.');
    }
    return structuredClone(seed);
  }

  const rows = await loadDatabaseChatModelRows(modelId);
  const models = groupResolvedRows(rows, []);
  const model = models.find((item) => item.id === modelId);

  if (!model) {
    throw new Error('AI model was not found.');
  }
  if (providerId && model.providerId !== providerId) {
    throw new Error('AI provider and model do not match.');
  }

  return model;
}
