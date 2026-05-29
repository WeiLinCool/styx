import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import {
  buildModelRequirementSeedKey,
  buildModelStatusActions,
  getSeedAiModelAdminData,
  getSeedChatModelsForUser,
  resolveSeedChatModelForUser,
  summarizeProviderCredentialReference,
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
