import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import { AccountDomainError } from './account-types';
import { listUserPermissionCodes, requireUserPermission } from './permission-service';

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
