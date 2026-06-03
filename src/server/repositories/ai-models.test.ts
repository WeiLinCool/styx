import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import {
  buildModelRequirementSeedKey,
  buildModelStatusActions,
  createAiModel,
  createAiProvider,
  getSeedAiModelAdminData,
  getSeedChatModelsForUser,
  getSeedImageModelsForUser,
  getSeedVideoModelsForUser,
  listDatabaseChatModelsForUserFromRows,
  listDatabaseImageModelsForUserFromRows,
  listDatabaseVideoModelsForUserFromRows,
  normalizeDefaultChatTarget,
  resolveDatabaseChatModelForUserFromRows,
  resolveDatabaseImageModelForUserFromRows,
  resolveDatabaseVideoModelForUserFromRows,
  resolveSeedChatModelForUser,
  resolveSeedImageModelForUser,
  resolveSeedVideoModelForUser,
  summarizeAdminAiConfigTestResult,
  summarizeProviderCredentialReference,
  updateAiModel,
  updateAiProvider,
  validateProviderTestConfiguration,
  type DatabaseChatModelRow,
  type DatabaseImageModelRow,
  type DatabaseVideoModelRow,
} from './ai-models';

const activeProEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  benefitCode: null,
  source: 'membership',
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
};

function buildDatabaseImageModelRow(input: {
  id: string;
  code: string;
  status?: 'enabled' | 'disabled' | 'archived';
  providerStatus?: 'enabled' | 'disabled' | 'archived';
  providerMetadata?: Record<string, unknown>;
  supportsImageGeneration?: boolean;
  supportsImageEdit?: boolean;
  supportsImageUpscale?: boolean;
  isDefaultImage?: boolean;
  requirement?: DatabaseImageModelRow['requirement'];
}): DatabaseImageModelRow {
  return {
    model: {
      id: input.id,
      providerId: `provider-${input.id}`,
      code: input.code,
      name: input.code,
      model: input.code,
      status: input.status ?? 'enabled',
      supportsChat: false,
      supportsImageGeneration: input.supportsImageGeneration ?? false,
      supportsImageEdit: input.supportsImageEdit ?? false,
      supportsImageUpscale: input.supportsImageUpscale ?? false,
      isDefaultChat: false,
      isDefaultImage: input.isDefaultImage ?? false,
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 1,
        completionCreditsPer1k: 0,
        minimumCredits: 1,
      },
    },
    provider: {
      id: `provider-${input.id}`,
      code: 'development',
      name: 'Development Provider',
      providerType: 'development',
      status: input.providerStatus ?? 'enabled',
      baseUrl: null,
      credentialEnvKey: null,
      metadata: input.providerMetadata ?? {},
    },
    requirement: input.requirement ?? null,
  };
}

function buildDatabaseChatModelRow(input: {
  id: string;
  code: string;
  status?: 'enabled' | 'disabled' | 'archived';
  providerStatus?: 'enabled' | 'disabled' | 'archived';
  providerMetadata?: Record<string, unknown>;
  supportsImageGeneration?: boolean;
  supportsImageEdit?: boolean;
  supportsImageUpscale?: boolean;
  isDefaultChat?: boolean;
  requirement?: DatabaseChatModelRow['requirement'];
}): DatabaseChatModelRow {
  return {
    model: {
      id: input.id,
      providerId: `provider-${input.id}`,
      code: input.code,
      name: input.code,
      model: input.code,
      status: input.status ?? 'enabled',
      supportsChat: true,
      supportsImageGeneration: input.supportsImageGeneration ?? false,
      supportsImageEdit: input.supportsImageEdit ?? false,
      supportsImageUpscale: input.supportsImageUpscale ?? false,
      supportsVideoGeneration: false,
      isDefaultChat: input.isDefaultChat ?? false,
      isDefaultImage: false,
      isDefaultVideo: false,
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 1,
        completionCreditsPer1k: 0,
        minimumCredits: 1,
      },
    },
    provider: {
      id: `provider-${input.id}`,
      code: 'development',
      name: 'Development Provider',
      providerType: 'development',
      status: input.providerStatus ?? 'enabled',
      baseUrl: null,
      credentialEnvKey: null,
      metadata: input.providerMetadata ?? {},
    },
    requirement: input.requirement ?? null,
  };
}

function buildDatabaseVideoModelRow(input: {
  id: string;
  code: string;
  status?: 'enabled' | 'disabled' | 'archived';
  providerStatus?: 'enabled' | 'disabled' | 'archived';
  providerMetadata?: Record<string, unknown>;
  supportsVideoGeneration?: boolean;
  isDefaultVideo?: boolean;
  requirement?: DatabaseVideoModelRow['requirement'];
}): DatabaseVideoModelRow {
  return {
    model: {
      id: input.id,
      providerId: `provider-${input.id}`,
      code: input.code,
      name: input.code,
      model: input.code,
      status: input.status ?? 'enabled',
      supportsChat: false,
      supportsImageGeneration: false,
      supportsImageEdit: false,
      supportsImageUpscale: false,
      supportsVideoGeneration: input.supportsVideoGeneration ?? false,
      isDefaultChat: false,
      isDefaultImage: false,
      isDefaultVideo: input.isDefaultVideo ?? false,
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 0,
        completionCreditsPer1k: 1,
        minimumCredits: 3,
      },
    },
    provider: {
      id: `provider-${input.id}`,
      code: 'development',
      name: 'Development Provider',
      providerType: 'development',
      status: input.providerStatus ?? 'enabled',
      baseUrl: null,
      credentialEnvKey: null,
      metadata: input.providerMetadata ?? {},
    },
    requirement: input.requirement ?? null,
  };
}

test('getSeedChatModelsForUser returns free model for users without entitlements', async () => {
  const models = await getSeedChatModelsForUser('user-free', []);

  assert.equal(models.some((model) => model.code === 'dev-free-chat'), true);
  assert.equal(models.some((model) => model.code === 'dev-pro-chat'), false);
});

test('resolveSeedChatModelForUser rejects premium model without entitlement', async () => {
  await assert.rejects(
    () => resolveSeedChatModelForUser('user-free', 'seed-model-pro', []),
    /Model entitlement is required/,
  );
});

test('resolveSeedChatModelForUser allows premium model with active pro entitlement', async () => {
  const model = await resolveSeedChatModelForUser('user-pro', 'seed-model-pro', [activeProEntitlement]);

  assert.equal(model.code, 'dev-pro-chat');
  assert.equal(model.entitlement.basis, 'membership_plan');
  assert.equal(model.entitlement.value, 'pro-monthly');
});

test('listDatabaseChatModelsForUserFromRows excludes multimodal models', () => {
  const rows: DatabaseChatModelRow[] = [
    buildDatabaseChatModelRow({
      id: 'model-chat',
      code: 'db-chat',
      isDefaultChat: true,
      requirement: {
        requirementType: 'none',
        requirementValue: null,
        label: 'Free',
      },
    }),
    buildDatabaseChatModelRow({
      id: 'model-multimodal',
      code: 'db-multimodal',
      supportsImageGeneration: true,
      requirement: {
        requirementType: 'none',
        requirementValue: null,
        label: 'Free',
      },
    }),
  ];

  const models = listDatabaseChatModelsForUserFromRows(rows, []);

  assert.deepEqual(models.map((model) => model.code), ['db-chat']);
});

test('resolveDatabaseChatModelForUserFromRows rejects multimodal model ids', () => {
  const rows: DatabaseChatModelRow[] = [
    buildDatabaseChatModelRow({
      id: 'model-multimodal',
      code: 'db-multimodal',
      supportsImageGeneration: true,
    }),
  ];

  assert.throws(
    () => resolveDatabaseChatModelForUserFromRows(rows, 'model-multimodal', []),
    /Model is not available/,
  );
});

test('resolveDatabaseChatModelForUserFromRows carries provider billing rules into runtime pricing', () => {
  const rows: DatabaseChatModelRow[] = [
    buildDatabaseChatModelRow({
      id: 'model-chat',
      code: 'db-chat',
      providerMetadata: {
        billingRules: {
          chat: {
            mode: 'token_breakdown',
            inputCreditsPer1k: 9,
            cachedInputCreditsPer1k: 0.5,
            cacheMissInputCreditsPer1k: 3,
            outputCreditsPer1k: 4,
            minimumCredits: 7,
          },
        },
      },
      requirement: {
        requirementType: 'none',
        requirementValue: null,
        label: 'Free',
      },
    }),
  ];

  const model = resolveDatabaseChatModelForUserFromRows(rows, 'model-chat', []);

  assert.equal(model.pricing.minimumCredits, 7);
  assert.equal(model.pricing.promptCreditsPer1k, 9);
  assert.equal(model.pricing.completionCreditsPer1k, 4);
  assert.equal(model.billingRules?.chat?.cacheMissInputCreditsPer1k, 3);
});

test('getSeedImageModelsForUser returns entitled models for the requested image mode', async () => {
  const freeModels = await getSeedImageModelsForUser('user-free', 'generate', []);
  assert.equal(freeModels.some((model) => model.code === 'dev-free-image'), true);

  const editModels = await getSeedImageModelsForUser('user-free', 'edit', []);
  assert.equal(editModels.every((model) => model.supportedModes.includes('edit')), true);
});

test('resolveSeedImageModelForUser rejects model that does not support requested image mode', async () => {
  await assert.rejects(
    () => resolveSeedImageModelForUser('user-free', 'seed-model-free-image', 'upscale', []),
    /Model is not available/,
  );
});

test('resolveSeedImageModelForUser allows premium image model with active pro entitlement', async () => {
  const model = await resolveSeedImageModelForUser(
    'user-pro',
    'seed-model-pro-image',
    'upscale',
    [activeProEntitlement],
  );

  assert.equal(model.code, 'dev-pro-image');
  assert.equal(model.entitlement.basis, 'membership_plan');
  assert.equal(model.supportedModes.includes('upscale'), true);
});

test('getSeedVideoModelsForUser returns entitled default video model', async () => {
  const models = await getSeedVideoModelsForUser('user-free', []);

  assert.equal(models.length > 0, true);
  assert.equal(models.some((model) => model.isDefault), true);
  assert.equal(models.every((model) => typeof model.pricingSummary === 'string'), true);
});

test('resolveSeedVideoModelForUser rejects non-video model ids', async () => {
  await assert.rejects(
    () => resolveSeedVideoModelForUser('user-free', 'seed-model-free-image', []),
    /Model is not available/,
  );
});

test('listDatabaseVideoModelsForUserFromRows filters status, support and entitlement', () => {
  const rows: DatabaseVideoModelRow[] = [
    buildDatabaseVideoModelRow({
      id: 'model-free-video',
      code: 'db-free-video',
      supportsVideoGeneration: true,
      isDefaultVideo: true,
      requirement: {
        requirementType: 'none',
        requirementValue: null,
        label: 'Free',
      },
    }),
    buildDatabaseVideoModelRow({
      id: 'model-pro-video',
      code: 'db-pro-video',
      supportsVideoGeneration: true,
      requirement: {
        requirementType: 'membership_plan',
        requirementValue: 'pro-monthly',
        label: 'Pro',
      },
    }),
    buildDatabaseVideoModelRow({
      id: 'model-disabled',
      code: 'db-disabled',
      status: 'disabled',
      supportsVideoGeneration: true,
    }),
    buildDatabaseVideoModelRow({
      id: 'model-chat-only',
      code: 'db-chat-only',
      supportsVideoGeneration: false,
    }),
  ];

  const models = listDatabaseVideoModelsForUserFromRows(rows, []);

  assert.deepEqual(models.map((model) => model.code), ['db-free-video']);
  assert.equal(models[0]?.isDefault, true);
});

test('resolveDatabaseVideoModelForUserFromRows allows entitled premium video model', () => {
  const rows: DatabaseVideoModelRow[] = [
    buildDatabaseVideoModelRow({
      id: 'model-pro-video',
      code: 'db-pro-video',
      supportsVideoGeneration: true,
      requirement: {
        requirementType: 'membership_plan',
        requirementValue: 'pro-monthly',
        label: 'Pro',
      },
    }),
  ];

  const model = resolveDatabaseVideoModelForUserFromRows(
    rows,
    'model-pro-video',
    [activeProEntitlement],
  );

  assert.equal(model.code, 'db-pro-video');
  assert.equal(model.entitlement.basis, 'membership_plan');
});

test('listDatabaseImageModelsForUserFromRows filters provider status, model status, mode support and entitlement', () => {
  const rows: DatabaseImageModelRow[] = [
    buildDatabaseImageModelRow({
      id: 'model-free-generate',
      code: 'db-free-generate',
      supportsImageGeneration: true,
      supportsImageEdit: true,
      isDefaultImage: true,
      requirement: {
        requirementType: 'none',
        requirementValue: null,
        label: 'Free',
      },
    }),
    buildDatabaseImageModelRow({
      id: 'model-pro-generate',
      code: 'db-pro-generate',
      supportsImageGeneration: true,
      requirement: {
        requirementType: 'membership_plan',
        requirementValue: 'pro-monthly',
        label: 'Pro',
      },
    }),
    buildDatabaseImageModelRow({
      id: 'model-disabled',
      code: 'db-disabled',
      status: 'disabled',
      supportsImageGeneration: true,
    }),
    buildDatabaseImageModelRow({
      id: 'model-provider-disabled',
      code: 'db-provider-disabled',
      providerStatus: 'disabled',
      supportsImageGeneration: true,
    }),
    buildDatabaseImageModelRow({
      id: 'model-edit-only',
      code: 'db-edit-only',
      supportsImageEdit: true,
    }),
  ];

  const models = listDatabaseImageModelsForUserFromRows(rows, 'generate', []);

  assert.deepEqual(models.map((model) => model.code), ['db-free-generate']);
  assert.equal(models[0]?.isDefault, true);
  assert.deepEqual(models[0]?.supportedModes, ['generate', 'edit']);
});

test('resolveDatabaseImageModelForUserFromRows rejects unavailable mode before entitlement', () => {
  const rows: DatabaseImageModelRow[] = [
    buildDatabaseImageModelRow({
      id: 'model-edit-only',
      code: 'db-edit-only',
      supportsImageEdit: true,
      requirement: {
        requirementType: 'membership_plan',
        requirementValue: 'pro-monthly',
        label: 'Pro',
      },
    }),
  ];

  assert.throws(
    () => resolveDatabaseImageModelForUserFromRows(rows, 'model-edit-only', 'upscale', []),
    /Model is not available/,
  );
});

test('resolveDatabaseImageModelForUserFromRows rejects unentitled premium image model', () => {
  const rows: DatabaseImageModelRow[] = [
    buildDatabaseImageModelRow({
      id: 'model-pro-generate',
      code: 'db-pro-generate',
      supportsImageGeneration: true,
      requirement: {
        requirementType: 'membership_plan',
        requirementValue: 'pro-monthly',
        label: 'Pro',
      },
    }),
  ];

  assert.throws(
    () => resolveDatabaseImageModelForUserFromRows(rows, 'model-pro-generate', 'generate', []),
    /Model entitlement is required/,
  );
});

test('resolveDatabaseImageModelForUserFromRows allows entitled premium image model', () => {
  const rows: DatabaseImageModelRow[] = [
    buildDatabaseImageModelRow({
      id: 'model-pro-upscale',
      code: 'db-pro-upscale',
      supportsImageGeneration: true,
      supportsImageUpscale: true,
      requirement: {
        requirementType: 'membership_plan',
        requirementValue: 'pro-monthly',
        label: 'Pro',
      },
    }),
  ];

  const model = resolveDatabaseImageModelForUserFromRows(
    rows,
    'model-pro-upscale',
    'upscale',
    [activeProEntitlement],
  );

  assert.equal(model.code, 'db-pro-upscale');
  assert.equal(model.entitlement.basis, 'membership_plan');
  assert.deepEqual(model.supportedModes, ['generate', 'upscale']);
});

test('buildModelRequirementSeedKey normalizes free requirement null value', () => {
  assert.equal(
    buildModelRequirementSeedKey({
      modelId: 'model-1',
      requirementType: 'none',
      requirementValue: null,
    }),
    'model-1:none:',
  );
  assert.equal(
    buildModelRequirementSeedKey({
      modelId: 'model-1',
      requirementType: 'membership_plan',
      requirementValue: 'pro-monthly',
    }),
    'model-1:membership_plan:pro-monthly',
  );
});

test('summarizeProviderCredentialReference validates references without exposing secrets', () => {
  const original = process.env.TEST_PROVIDER_SECRET;
  process.env.TEST_PROVIDER_SECRET = 'super-secret-value';

  try {
    assert.deepEqual(
      summarizeProviderCredentialReference({
        providerType: 'openai_compatible',
        baseUrl: 'https://api.example.com/v1',
        credentialEnvKey: 'TEST_PROVIDER_SECRET',
      }),
      {
        label: 'TEST_PROVIDER_SECRET',
        status: 'valid',
        detail: 'credential reference configured',
      },
    );
  } finally {
    if (original === undefined) {
      delete process.env.TEST_PROVIDER_SECRET;
    } else {
      process.env.TEST_PROVIDER_SECRET = original;
    }
  }
});

test('summarizeProviderCredentialReference reports missing endpoint or env var', () => {
  delete process.env.TEST_PROVIDER_MISSING_SECRET;

  assert.deepEqual(
    summarizeProviderCredentialReference({
      providerType: 'openai_compatible',
      baseUrl: null,
      credentialEnvKey: 'TEST_PROVIDER_MISSING_SECRET',
    }),
    {
      label: 'TEST_PROVIDER_MISSING_SECRET',
      status: 'invalid',
      detail: 'missing base URL and environment variable value',
    },
  );

  assert.deepEqual(
    summarizeProviderCredentialReference({
      providerType: 'development',
      baseUrl: null,
      credentialEnvKey: null,
    }),
    {
      label: 'not required',
      status: 'not_required',
      detail: 'development provider does not require credentials',
    },
  );
});

test('getSeedAiModelAdminData shows provider, model, default and entitlement details', async () => {
  const data = await getSeedAiModelAdminData();
  const freeModel = data.records.find((record) => record.code === 'dev-free-chat');
  const proModel = data.records.find((record) => record.code === 'dev-pro-chat');
  const freeImageModel = data.records.find((record) => record.code === 'dev-free-image');

  assert.equal(data.source, 'seed');
  assert.equal(data.providers.length, 1);
  assert.equal(freeModel?.isDefaultChat, true);
  assert.equal(freeModel?.supportsChat, true);
  assert.equal(freeModel?.entitlementSummary, 'Free');
  assert.equal(proModel?.entitlementSummary, 'Pro');
  assert.equal(freeModel?.providerStatus, 'enabled');
  assert.equal(freeModel?.credential.status, 'not_required');
  assert.equal(freeImageModel?.supportsImageGeneration, true);
  assert.equal(freeImageModel?.supportsImageEdit, true);
  assert.equal(freeImageModel?.supportsImageUpscale, false);
  assert.equal(freeImageModel?.isDefaultImage, true);
});

test('buildModelStatusActions only offers meaningful enabled and disabled transitions', () => {
  assert.deepEqual(buildModelStatusActions('model-1', 'enabled'), [
    {
      label: '停用',
      url: '/api/admin/ai-models/model-1/status',
      body: { status: 'disabled' },
      successMessage: 'AI 模型已停用。',
      variant: 'destructive',
    },
  ]);

  assert.deepEqual(buildModelStatusActions('model-2', 'archived'), [
    {
      label: '启用',
      url: '/api/admin/ai-models/model-2/status',
      body: { status: 'enabled' },
      successMessage: 'AI 模型已启用。',
    },
  ]);
});

test('validateProviderTestConfiguration rejects missing base URL before upstream request', () => {
  assert.throws(
    () =>
      validateProviderTestConfiguration({
        providerType: 'openai_compatible',
        baseUrl: null,
        credentialEnvKey: 'TEST_OPENAI_KEY',
        model: 'gpt-4o-mini',
      }),
    /missing configuration/i,
  );
});

test('normalizeDefaultChatTarget rejects disabled targets', () => {
  assert.throws(
    () =>
      normalizeDefaultChatTarget({
        id: 'model-1',
        status: 'disabled',
        supportsChat: true,
        providerStatus: 'enabled',
      }),
    /default chat model/i,
  );
});

test('summarizeAdminAiConfigTestResult trims unsafe upstream error detail', () => {
  const summary = summarizeAdminAiConfigTestResult({
    ok: false,
    elapsedMs: 123,
    providerLabel: 'Provider 1',
    modelLabel: 'Model 1',
    error: 'x'.repeat(800),
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.error?.length, 280);
});

test('createAiProvider returns a configured provider summary in seed mode', async () => {
  const provider = await createAiProvider({
    code: 'openrouter',
    name: 'OpenRouter',
    providerType: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    credentialEnvKey: 'OPENROUTER_API_KEY',
    status: 'disabled',
  });

  assert.equal(provider.code, 'openrouter');
  assert.equal(provider.name, 'OpenRouter');
  assert.equal(provider.credential.label, 'OPENROUTER_API_KEY');
});

test('updateAiProvider updates provider summary in seed mode', async () => {
  const provider = await updateAiProvider({
    providerId: 'seed-provider-development',
    code: 'development',
    name: 'Development Provider Updated',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    status: 'disabled',
  });

  assert.equal(provider.name, 'Development Provider Updated');
  assert.equal(provider.status, 'disabled');
});

test('updateAiModel updates model summary in seed mode', async () => {
  const model = await updateAiModel({
    modelId: 'seed-model-free',
    providerId: 'seed-provider-development',
    code: 'dev-free-chat',
    name: 'Development Free Chat Updated',
    model: 'development-free-chat-updated',
    status: 'enabled',
    supportsChat: true,
    supportsImageGeneration: false,
    supportsImageEdit: false,
    supportsImageUpscale: false,
    supportsVideoGeneration: false,
  });

  assert.equal(model.name, 'Development Free Chat Updated');
  assert.equal(model.model, 'development-free-chat-updated');
});

test('updateAiModel accepts image capability flags in seed mode', async () => {
  const model = await updateAiModel({
    modelId: 'seed-model-free-image',
    providerId: 'seed-provider-development',
    code: 'dev-free-image',
    name: 'Development Free Image Updated',
    model: 'development-free-image-updated',
    status: 'enabled',
    supportsChat: false,
    supportsImageGeneration: true,
    supportsImageEdit: false,
    supportsImageUpscale: true,
    supportsVideoGeneration: false,
  });

  assert.equal(model.supportsChat, false);
  assert.equal(model.supportsImageGeneration, true);
  assert.equal(model.supportsImageEdit, false);
  assert.equal(model.supportsImageUpscale, true);
});

test('createAiModel returns a new model summary in seed mode', async () => {
  const model = await createAiModel({
    providerId: 'seed-provider-development',
    code: 'dev-preview-chat',
    name: 'Development Preview Chat',
    model: 'development-preview-chat',
    status: 'disabled',
    supportsChat: true,
    supportsImageGeneration: false,
    supportsImageEdit: false,
    supportsImageUpscale: false,
    supportsVideoGeneration: false,
  });

  assert.equal(model.code, 'dev-preview-chat');
  assert.equal(model.providerId, 'seed-provider-development');
});

test('createAiModel accepts image capability flags in seed mode', async () => {
  const model = await createAiModel({
    providerId: 'seed-provider-development',
    code: 'dev-image-extra',
    name: 'Development Image Extra',
    model: 'development-image-extra',
    status: 'enabled',
    supportsChat: false,
    supportsImageGeneration: true,
    supportsImageEdit: false,
    supportsImageUpscale: true,
    supportsVideoGeneration: false,
  });

  assert.equal(model.supportsChat, false);
  assert.equal(model.supportsImageGeneration, true);
  assert.equal(model.supportsImageEdit, false);
  assert.equal(model.supportsImageUpscale, true);
});
