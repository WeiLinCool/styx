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
  normalizeDefaultChatTarget,
  resolveSeedChatModelForUser,
  summarizeAdminAiConfigTestResult,
  summarizeProviderCredentialReference,
  updateAiModel,
  updateAiProvider,
  validateProviderTestConfiguration,
} from './ai-models';

const activeProEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  benefitCode: null,
  source: 'membership',
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
};

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

  assert.equal(data.source, 'seed');
  assert.equal(data.providers.length, 1);
  assert.equal(freeModel?.isDefaultChat, true);
  assert.equal(freeModel?.supportsChat, true);
  assert.equal(freeModel?.entitlementSummary, 'Free');
  assert.equal(proModel?.entitlementSummary, 'Pro');
  assert.equal(freeModel?.providerStatus, 'enabled');
  assert.equal(freeModel?.credential.status, 'not_required');
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
  });

  assert.equal(model.name, 'Development Free Chat Updated');
  assert.equal(model.model, 'development-free-chat-updated');
});

test('createAiModel returns a new model summary in seed mode', async () => {
  const model = await createAiModel({
    providerId: 'seed-provider-development',
    code: 'dev-preview-chat',
    name: 'Development Preview Chat',
    model: 'development-preview-chat',
    status: 'disabled',
    supportsChat: true,
  });

  assert.equal(model.code, 'dev-preview-chat');
  assert.equal(model.providerId, 'seed-provider-development');
});
