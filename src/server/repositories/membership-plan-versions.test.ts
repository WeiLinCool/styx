import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMembershipPlanVersionHarness,
  duplicateMembershipPlanVersionAsDraft,
  publishMembershipPlanDraft,
  resolvePlanVersionForEntitlement,
  saveMembershipPlanDraftWithLoader,
  scheduleMembershipPlanDraft,
} from './membership-plan-versions';

test('resolvePlanVersionForEntitlement prefers published version when no future schedule is active', async () => {
  const harness = createMembershipPlanVersionHarness();

  const version = await resolvePlanVersionForEntitlement('pro-monthly', {
    now: new Date('2026-06-03T10:00:00.000Z'),
    loader: harness,
  });

  assert.equal(version.status, 'published');
  assert.equal(version.versionNumber, 1);
});

test('resolvePlanVersionForEntitlement uses scheduled version after its effective time', async () => {
  const harness = createMembershipPlanVersionHarness({
    versions: [
      {
        id: 'v1',
        planId: 'plan-1',
        planCode: 'pro-monthly',
        versionNumber: 1,
        status: 'published',
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        publishedAt: '2026-06-01T00:00:00.000Z',
        displayName: 'Pro Monthly',
        description: 'v1',
        billingPeriod: 'month',
        priceCents: 9900,
        currency: 'CNY',
        changeSummary: null,
        benefits: [],
        permissionCodes: [],
      },
      {
        id: 'v2',
        planId: 'plan-1',
        planCode: 'pro-monthly',
        versionNumber: 2,
        status: 'scheduled',
        effectiveFrom: '2026-06-10T00:00:00.000Z',
        publishedAt: null,
        displayName: 'Pro Monthly 2',
        description: 'v2',
        billingPeriod: 'month',
        priceCents: 12900,
        currency: 'CNY',
        changeSummary: null,
        benefits: [],
        permissionCodes: [],
      },
    ],
  });

  const version = await resolvePlanVersionForEntitlement('pro-monthly', {
    now: new Date('2026-06-11T00:00:00.000Z'),
    loader: harness,
  });

  assert.equal(version.id, 'v2');
  assert.equal(version.versionNumber, 2);
});

test('saveMembershipPlanDraftWithLoader creates or updates a draft version', async () => {
  const harness = createMembershipPlanVersionHarness();

  const draft = await saveMembershipPlanDraftWithLoader(
    {
      planId: 'seed:pro',
      displayName: 'Pro Monthly Updated',
      description: 'new desc',
      billingPeriod: 'month',
      priceCents: 12900,
      currency: 'CNY',
      changeSummary: 'price update',
      benefits: [
        {
          code: 'image-credits',
          name: 'Image credits',
          kind: 'quota',
          quantity: 600,
          unit: 'credit',
        },
      ],
      permissionCodes: ['page.user_center'],
    },
    harness,
  );

  assert.equal(draft.status, 'draft');
  assert.equal(draft.versionNumber, 2);
  assert.equal(draft.displayName, 'Pro Monthly Updated');
});

test('publishMembershipPlanDraft archives the previous published version', async () => {
  const harness = createMembershipPlanVersionHarness();

  await saveMembershipPlanDraftWithLoader(
    {
      planId: 'seed:pro',
      displayName: 'Pro Monthly Updated',
      description: 'new desc',
      billingPeriod: 'month',
      priceCents: 12900,
      currency: 'CNY',
      changeSummary: 'price update',
      benefits: [],
      permissionCodes: [],
    },
    harness,
  );

  const published = await publishMembershipPlanDraft('seed:pro', { actorId: 'admin-1' }, harness);

  assert.equal(published.status, 'published');
  assert.equal(published.versionNumber, 2);

  const versions = await harness.listVersionsByPlanCode('pro-monthly');
  assert.equal(versions.filter((item) => item.status === 'published').length, 1);
  assert.equal(versions.some((item) => item.versionNumber === 1 && item.status === 'archived'), true);
});

test('scheduleMembershipPlanDraft marks the draft as scheduled', async () => {
  const harness = createMembershipPlanVersionHarness();

  await saveMembershipPlanDraftWithLoader(
    {
      planId: 'seed:pro',
      displayName: 'Pro Monthly Updated',
      description: 'new desc',
      billingPeriod: 'month',
      priceCents: 12900,
      currency: 'CNY',
      changeSummary: 'price update',
      benefits: [],
      permissionCodes: [],
    },
    harness,
  );

  const scheduled = await scheduleMembershipPlanDraft(
    'seed:pro',
    { effectiveFrom: '2026-06-15T00:00:00.000Z', actorId: 'admin-1' },
    harness,
  );

  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.effectiveFrom, '2026-06-15T00:00:00.000Z');
});

test('duplicateMembershipPlanVersionAsDraft copies a history version into the draft slot', async () => {
  const harness = createMembershipPlanVersionHarness({
    versions: [
      {
        id: 'v1',
        planId: 'seed:pro',
        planCode: 'pro-monthly',
        versionNumber: 1,
        status: 'archived',
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        publishedAt: '2026-06-01T00:00:00.000Z',
        displayName: 'Pro Monthly',
        description: 'v1',
        billingPeriod: 'month',
        priceCents: 9900,
        currency: 'CNY',
        changeSummary: null,
        benefits: [],
        permissionCodes: ['page.user_center'],
      },
    ],
  });

  const draft = await duplicateMembershipPlanVersionAsDraft('seed:pro', 'v1', harness);

  assert.equal(draft.status, 'draft');
  assert.equal(draft.versionNumber, 2);
  assert.equal(draft.permissionCodes[0], 'page.user_center');
});
