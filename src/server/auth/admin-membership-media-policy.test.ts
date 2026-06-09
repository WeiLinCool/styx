import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import type { MembershipPlanVersionRecord } from '@/server/repositories/membership-plan-versions';

import {
  RESTRICTIVE_MEDIA_POLICY,
  resolveAdminResyncMembershipMediaPolicy,
} from './admin-membership-media-policy';

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

function createVersion(
  overrides: Partial<MembershipPlanVersionRecord> = {},
): MembershipPlanVersionRecord {
  return {
    id: 'version-pro-v2',
    planId: 'plan-pro',
    planCode: 'pro-monthly',
    versionNumber: 2,
    status: 'published',
    effectiveFrom: '2026-06-01T00:00:00.000Z',
    publishedAt: '2026-06-09T00:00:00.000Z',
    displayName: 'Pro Monthly',
    description: null,
    billingPeriod: 'month',
    priceCents: 9900,
    currency: 'CNY',
    changeSummary: null,
    benefits: [],
    mediaLibraryPolicy: {
      storageQuotaBytes: 2 * 1024 * 1024 * 1024,
      allowUserUpload: true,
      allowPublicSharing: true,
    },
    videoGenerationPolicy: null,
    permissionCodes: [],
    ...overrides,
  };
}

test('resolveAdminResyncMembershipMediaPolicy prefers latest published version for active plan code', async () => {
  const result = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [createMembershipEntitlement({ planVersionId: 'version-pro-v1' })],
    resolveLatestPublishedVersionByPlanCode: async (planCode) => {
      assert.equal(planCode, 'pro-monthly');
      return createVersion({
        id: 'version-pro-v2',
        versionNumber: 2,
        mediaLibraryPolicy: {
          storageQuotaBytes: 5 * 1024 * 1024 * 1024,
          allowUserUpload: true,
          allowPublicSharing: false,
        },
      });
    },
  });

  assert.deepEqual(result, {
    policy: {
      storageQuotaBytes: 5 * 1024 * 1024 * 1024,
      allowUserUpload: true,
      allowPublicSharing: false,
    },
    sourcePlanCode: 'pro-monthly',
    sourceVersionId: 'version-pro-v2',
    sourceVersionNumber: 2,
  });
});

test('resolveAdminResyncMembershipMediaPolicy returns restrictive defaults when user has no active membership', async () => {
  const result = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [],
    resolveLatestPublishedVersionByPlanCode: async () => {
      throw new Error('should not resolve version without active plan');
    },
  });

  assert.deepEqual(result, {
    policy: RESTRICTIVE_MEDIA_POLICY,
    sourcePlanCode: null,
    sourceVersionId: null,
    sourceVersionNumber: null,
  });
});

test('resolveAdminResyncMembershipMediaPolicy ignores newer draft semantics and still uses latest published version loader result', async () => {
  const calls: string[] = [];

  const result = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [createMembershipEntitlement()],
    resolveLatestPublishedVersionByPlanCode: async (planCode) => {
      calls.push(planCode);
      return createVersion({
        id: 'version-pro-v3',
        versionNumber: 3,
        mediaLibraryPolicy: {
          storageQuotaBytes: 3 * 1024 * 1024 * 1024,
          allowUserUpload: true,
          allowPublicSharing: true,
        },
      });
    },
  });

  assert.deepEqual(calls, ['pro-monthly']);
  assert.equal(result.policy.storageQuotaBytes, 3 * 1024 * 1024 * 1024);
  assert.equal(result.sourceVersionId, 'version-pro-v3');
  assert.equal(result.sourceVersionNumber, 3);
});
