import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';

import {
  RESTRICTIVE_MEDIA_POLICY,
  resolveCurrentUserMediaPolicy,
} from './membership-media-policy';

function createMembershipEntitlement(
  overrides: Partial<ActiveUserEntitlement> = {},
): ActiveUserEntitlement {
  return {
    planCode: 'pro-monthly',
    planVersionId: 'version-pro-v1',
    benefitCode: null,
    source: 'membership',
    startsAt: '2026-06-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('resolveCurrentUserMediaPolicy returns structured policy from active membership version', async () => {
  const policy = await resolveCurrentUserMediaPolicy('user-1', {
    now: new Date('2026-06-04T00:00:00.000Z'),
    entitlements: [createMembershipEntitlement()],
    versionLoader: async () => ({
      id: 'version-pro-v1',
      planId: 'plan-1',
      planCode: 'pro-monthly',
      versionNumber: 1,
      status: 'published',
      effectiveFrom: '2026-06-01T00:00:00.000Z',
      publishedAt: '2026-06-01T00:00:00.000Z',
      displayName: 'Pro Monthly',
      description: null,
      billingPeriod: 'month',
      priceCents: 9900,
      currency: 'CNY',
      changeSummary: null,
      benefits: [],
      mediaLibraryPolicy: {
        storageQuotaBytes: 1073741824,
        allowUserUpload: true,
        allowPublicSharing: false,
      },
      permissionCodes: [],
    }),
  });

  assert.deepEqual(policy, {
    storageQuotaBytes: 1073741824,
    allowUserUpload: true,
    allowPublicSharing: false,
  });
});

test('resolveCurrentUserMediaPolicy returns restrictive defaults for free users', async () => {
  const policy = await resolveCurrentUserMediaPolicy('user-1', {
    now: new Date('2026-06-04T00:00:00.000Z'),
    entitlements: [],
  });

  assert.deepEqual(policy, RESTRICTIVE_MEDIA_POLICY);
});

test('resolveCurrentUserMediaPolicy falls back to active plan code when legacy entitlement misses planVersionId', async () => {
  const policy = await resolveCurrentUserMediaPolicy('user-1', {
    now: new Date('2026-06-04T00:00:00.000Z'),
    entitlements: [
      createMembershipEntitlement({
        planCode: 'team-yearly',
        planVersionId: null,
        expiresAt: '2027-06-04T00:00:00.000Z',
      }),
    ],
    resolveVersionByPlanCode: async (planCode) => {
      assert.equal(planCode, 'team-yearly');
      return {
        id: 'version-team-v2',
        planId: 'plan-team',
        planCode: 'team-yearly',
        versionNumber: 2,
        status: 'published',
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        publishedAt: '2026-06-01T00:00:00.000Z',
        displayName: 'Team Yearly',
        description: null,
        billingPeriod: 'year',
        priceCents: 99900,
        currency: 'CNY',
        changeSummary: null,
        benefits: [],
        mediaLibraryPolicy: {
          storageQuotaBytes: 100 * 1024 * 1024 * 1024,
          allowUserUpload: true,
          allowPublicSharing: true,
        },
        permissionCodes: [],
      };
    },
  });

  assert.deepEqual(policy, {
    storageQuotaBytes: 100 * 1024 * 1024 * 1024,
    allowUserUpload: true,
    allowPublicSharing: true,
  });
});

test('resolveCurrentUserMediaPolicy falls back to restrictive defaults when membership version is missing', async () => {
  const policy = await resolveCurrentUserMediaPolicy('user-1', {
    now: new Date('2026-06-04T00:00:00.000Z'),
    entitlements: [createMembershipEntitlement()],
    versionLoader: async () => null,
  });

  assert.deepEqual(policy, RESTRICTIVE_MEDIA_POLICY);
});
