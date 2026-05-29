import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import {
  buildModelRequirementSeedKey,
  getSeedChatModelsForUser,
  resolveSeedChatModelForUser,
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
