import { and, asc, eq } from 'drizzle-orm';

import {
  evaluateModelEntitlement,
  listActiveUserEntitlements,
  type ActiveUserEntitlement,
  type ModelEntitlementRequirement,
  type ModelEntitlementResult,
} from '@/server/ai/model-entitlements';
import { db, schema } from '@/server/db';

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
  return `${pricing.minimumCredits} credit${pricing.minimumCredits === 1 ? '' : 's'} minimum`;
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
