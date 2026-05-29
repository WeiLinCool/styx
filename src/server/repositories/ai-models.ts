import { and, asc, desc, eq } from 'drizzle-orm';

import {
  evaluateModelEntitlement,
  listActiveUserEntitlements,
  type ActiveUserEntitlement,
  type ModelEntitlementRequirement,
  type ModelEntitlementResult,
} from '@/server/ai/model-entitlements';
import { db, schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
} from './admin-shared';

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
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
};

export type ResolvedChatModel = PublicChatModelDto & {
  providerId: string;
  providerCode: string;
  providerType: 'openai_compatible' | 'development';
  baseUrl: string | null;
  credentialEnvKey: string | null;
  model: string;
  pricing: AiModelPricing;
  entitlement: ModelEntitlementResult;
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
  status: AiModelStatus;
  supportsChat: boolean;
  isDefaultChat: boolean;
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
};

export type AdminAiModelData = AdminModuleData<AdminAiModelRow> & {
  providers: AdminAiProviderRow[];
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

const seedProviders = [
  {
    id: 'seed-provider-development',
    code: 'development',
    name: 'Development Provider',
    providerType: 'development',
    status: 'enabled',
    baseUrl: null,
    credentialEnvKey: null,
  },
] satisfies Array<{
  id: string;
  code: string;
  name: string;
  providerType: AiProviderType;
  status: AiProviderStatus;
  baseUrl: string | null;
  credentialEnvKey: string | null;
}>;

type ChatModelRow = {
  model: typeof schema.aiModels.$inferSelect;
  provider: typeof schema.aiProviders.$inferSelect;
  requirement: typeof schema.aiModelEntitlementRequirements.$inferSelect | null;
};

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

export async function listAvailableChatModelsForUser(
  userId: string,
): Promise<PublicChatModelDto[]> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return getSeedChatModelsForUser(userId, entitlements);
  }

  return groupResolvedRows(await loadDatabaseChatModelRows(), entitlements)
    .filter((model) => model.entitlement.allowed)
    .map(toPublicModel);
}

export async function resolveChatModelForUser(
  userId: string,
  modelId: string,
): Promise<ResolvedChatModel> {
  const entitlements = await listActiveUserEntitlements(userId);

  if (!db || !process.env.DATABASE_URL) {
    return resolveSeedChatModelForUser(userId, modelId, entitlements);
  }

  const models = groupResolvedRows(await loadDatabaseChatModelRows(modelId), entitlements);
  const model = models.find((item) => item.id === modelId);
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
        status: input.status,
        supportsChat: true,
        isDefaultChat: seed.isDefault,
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

export function getSeedAiModelAdminData(): AdminAiModelData {
  const records = seedModels.map((model) =>
    toAdminAiModelRow({
      model: {
        id: model.id,
        providerId: model.providerId,
        code: model.code,
        name: model.name,
        model: model.model,
        status: 'enabled',
        supportsChat: true,
        isDefaultChat: model.isDefault,
        pricing: model.pricing,
      },
      provider: seedProviders[0],
      requirements: seedRequirementForModel(model),
    }),
  );

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
  const providers = buildAdminProviderRows(records, groupedModels.map((row) => row.provider));

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
    providerName: model.providerName,
    isDefault: model.isDefault,
    entitlementLabel: model.entitlement.label,
    pricingSummary: pricingSummary(model.pricing),
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

function groupResolvedRows(
  rows: ChatModelRow[],
  entitlements: ActiveUserEntitlement[],
): ResolvedChatModel[] {
  const grouped = new Map<
    string,
    {
      model: typeof schema.aiModels.$inferSelect;
      provider: typeof schema.aiProviders.$inferSelect;
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
        requirements: [],
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
    const pricing = parsePricing(model.pricing);
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
      pricing,
      entitlement,
    };
  });
}

async function loadDatabaseChatModelRows(modelId?: string): Promise<ChatModelRow[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const where = modelId
    ? and(
        eq(schema.aiModels.id, modelId),
        eq(schema.aiModels.status, 'enabled'),
        eq(schema.aiModels.supportsChat, true),
        eq(schema.aiProviders.status, 'enabled'),
      )
    : and(
        eq(schema.aiModels.status, 'enabled'),
        eq(schema.aiModels.supportsChat, true),
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
    | 'status'
    | 'supportsChat'
    | 'isDefaultChat'
    | 'pricing'
  >;
  provider: Pick<
    typeof schema.aiProviders.$inferSelect,
    'id' | 'code' | 'name' | 'providerType' | 'status' | 'baseUrl' | 'credentialEnvKey'
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
    status: group.model.status,
    supportsChat: group.model.supportsChat,
    isDefaultChat: group.model.isDefaultChat,
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
        hint: source === 'database' ? 'PostgreSQL' : 'seed',
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
        status: schema.aiModels.status,
        supportsChat: schema.aiModels.supportsChat,
        isDefaultChat: schema.aiModels.isDefaultChat,
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
