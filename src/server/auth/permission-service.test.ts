import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import { createMemoryServerCache } from '@/server/cache/server-cache';
import { AccountDomainError } from './account-types';
import {
  getUserPermissionCacheKey,
  invalidateUserPermissionCache,
  invalidateUserPermissionCacheForPlan,
  invalidateUserPermissionCacheForVersion,
  listUserPermissionCodes,
  requireUserPermission,
} from './permission-service';

const activeProEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  planVersionId: 'version-pro-v1',
  benefitCode: null,
  source: 'membership',
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
};

const expiredTeamEntitlement: ActiveUserEntitlement = {
  planCode: 'team-yearly',
  planVersionId: 'version-team-v1',
  benefitCode: null,
  source: 'membership',
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-02-01T00:00:00.000Z',
};

test('listUserPermissionCodes resolves codes from active entitlement plans only', async () => {
  const codes = await listUserPermissionCodes('user-1', {
    now: new Date('2026-06-03T00:00:00.000Z'),
    entitlements: [activeProEntitlement, expiredTeamEntitlement],
    planPermissionCodes: {
      'pro-monthly': ['menu.user_center', 'page.user_center'],
      'team-yearly': ['page.team_workspace'],
    },
  });

  assert.deepEqual(codes, ['menu.user_center', 'page.user_center']);
});

test('listUserPermissionCodes resolves codes from active entitlement versions when provided', async () => {
  const codes = await listUserPermissionCodes('user-1', {
    now: new Date('2026-06-03T00:00:00.000Z'),
    entitlements: [activeProEntitlement, expiredTeamEntitlement],
    planPermissionCodes: {
      'pro-monthly': ['menu.user_center'],
      'team-yearly': ['page.team_workspace'],
    },
    versionPermissionCodes: {
      'version-pro-v1': ['page.user_center', 'action.user_center.copy_invite_code'],
      'version-team-v1': ['page.team_workspace'],
    },
  });

  assert.deepEqual(codes, ['action.user_center.copy_invite_code', 'page.user_center']);
});

test('requireUserPermission throws on missing permission', async () => {
  await assert.rejects(
    () =>
      requireUserPermission(
        { user: { id: 'user-1' } },
        'api.user.points.checkin',
        {
          entitlements: [activeProEntitlement],
          planPermissionCodes: {
            'pro-monthly': ['page.user_center'],
          },
        },
      ),
    (error) => error instanceof AccountDomainError && error.code === 'permission_denied',
  );
});

test('listUserPermissionCodes caches resolved permission codes on the server', async () => {
  const cache = createMemoryServerCache();
  const now = new Date('2026-06-03T00:00:00.000Z');
  let entitlementLookups = 0;

  const first = await listUserPermissionCodes('user-1', {
    now,
    cache,
    getEntitlements: async () => {
      entitlementLookups += 1;
      return [activeProEntitlement];
    },
    getPlanPermissionCodes: async () => ['page.user_center'],
    getVersionPermissionCodes: async () => [],
  });

  const second = await listUserPermissionCodes('user-1', {
    now,
    cache,
    getEntitlements: async () => {
      entitlementLookups += 1;
      return [expiredTeamEntitlement];
    },
    getPlanPermissionCodes: async () => ['page.team_workspace'],
    getVersionPermissionCodes: async () => [],
  });

  assert.deepEqual(first, ['page.user_center']);
  assert.deepEqual(second, ['page.user_center']);
  assert.equal(entitlementLookups, 1);
  assert.deepEqual(
    await cache.getJson(getUserPermissionCacheKey('user-1')),
    ['page.user_center'],
  );
});

test('invalidateUserPermissionCache removes cached permission codes', async () => {
  const cache = createMemoryServerCache();
  await cache.setJson(getUserPermissionCacheKey('user-1'), ['page.user_center'], 1000);

  await invalidateUserPermissionCache('user-1', { cache });

  assert.equal(await cache.getJson(getUserPermissionCacheKey('user-1')), null);
});

test('invalidateUserPermissionCacheForPlan removes cached permission codes for affected users', async () => {
  const cache = createMemoryServerCache();
  await cache.setJson(getUserPermissionCacheKey('user-1'), ['page.user_center'], 1000);
  await cache.setJson(getUserPermissionCacheKey('user-2'), ['page.team_workspace'], 1000);

  await invalidateUserPermissionCacheForPlan('plan-1', {
    cache,
    listUserIdsByPlanId: async () => ['user-1'],
  });

  assert.equal(await cache.getJson(getUserPermissionCacheKey('user-1')), null);
  assert.deepEqual(await cache.getJson(getUserPermissionCacheKey('user-2')), ['page.team_workspace']);
});

test('invalidateUserPermissionCacheForVersion removes cached permission codes for affected users', async () => {
  const cache = createMemoryServerCache();
  await cache.setJson(getUserPermissionCacheKey('user-1'), ['page.user_center'], 1000);
  await cache.setJson(getUserPermissionCacheKey('user-2'), ['page.team_workspace'], 1000);

  await invalidateUserPermissionCacheForVersion('version-1', {
    cache,
    listUserIdsByVersionId: async () => ['user-2'],
  });

  assert.deepEqual(await cache.getJson(getUserPermissionCacheKey('user-1')), ['page.user_center']);
  assert.equal(await cache.getJson(getUserPermissionCacheKey('user-2')), null);
});
