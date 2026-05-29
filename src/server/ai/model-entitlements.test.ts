import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateModelEntitlement,
  type ActiveUserEntitlement,
  type ModelEntitlementRequirement,
} from './model-entitlements';

const activePlanEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  benefitCode: null,
  source: 'membership',
  expiresAt: null,
};

const expiredPlanEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  benefitCode: null,
  source: 'membership',
  expiresAt: '2026-01-01T00:00:00.000Z',
};

test('evaluateModelEntitlement allows free model', () => {
  const result = evaluateModelEntitlement({
    requirements: [{ type: 'none', value: null, label: 'Free' }],
    entitlements: [],
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.deepEqual(result, {
    allowed: true,
    basis: 'none',
    label: 'Free',
    value: null,
  });
});

test('evaluateModelEntitlement allows active membership plan requirement', () => {
  const result = evaluateModelEntitlement({
    requirements: [
      { type: 'membership_plan', value: 'pro-monthly', label: 'Pro' },
    ],
    entitlements: [activePlanEntitlement],
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.equal(result.allowed, true);
  assert.equal(result.basis, 'membership_plan');
  assert.equal(result.value, 'pro-monthly');
});

test('evaluateModelEntitlement rejects expired membership plan requirement', () => {
  const result = evaluateModelEntitlement({
    requirements: [
      { type: 'membership_plan', value: 'pro-monthly', label: 'Pro' },
    ],
    entitlements: [expiredPlanEntitlement],
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.equal(result.allowed, false);
  assert.equal(result.basis, 'none');
});
