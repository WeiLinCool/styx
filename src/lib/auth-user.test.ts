import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSubmitPasswordRegistration,
  hasUserPointsOverview,
  shouldRefreshAuthUserSnapshot,
  shouldReplaceAuthUser,
} from './auth-user';
import type { AuthUserInfo } from './auth-context';

const baseUser: AuthUserInfo = {
  id: 'user-1',
  nickname: 'Lingwei',
  avatar: 'lingwei@example.com',
  email: 'lingwei@example.com',
  phone: '13800000000',
  membershipLevel: 'free',
  membershipExpiry: null,
  userLevel: 'free',
  accountState: 'active',
  points: 0,
};

test('shouldReplaceAuthUser keeps the current object for unchanged auth payloads', () => {
  assert.equal(shouldReplaceAuthUser(baseUser, { ...baseUser }), false);
});

test('shouldReplaceAuthUser replaces the current object when auth payload changes', () => {
  assert.equal(
    shouldReplaceAuthUser(baseUser, {
      ...baseUser,
      points: 12,
    }),
    true,
  );
});

test('hasUserPointsOverview requires check-in status and recent activity fields', () => {
  assert.equal(hasUserPointsOverview(baseUser), false);
  assert.equal(
    hasUserPointsOverview({
      ...baseUser,
      checkinStatus: {
        businessDate: '2026-06-02',
        checkedIn: true,
        rewardPoints: 2,
        streakCount: 1,
        checkedInAt: '2026-06-02T00:00:00.000Z',
      },
      recentPointActivities: [],
    }),
    true,
  );
});

test('shouldRefreshAuthUserSnapshot refreshes stale activation or incomplete overview snapshots', () => {
  const completeActiveUser = {
    ...baseUser,
    checkinStatus: {
      businessDate: '2026-06-02',
      checkedIn: false,
      rewardPoints: null,
      streakCount: null,
      checkedInAt: null,
    },
    recentPointActivities: [],
  };

  assert.equal(shouldRefreshAuthUserSnapshot(completeActiveUser), false);
  assert.equal(
    shouldRefreshAuthUserSnapshot({
      ...completeActiveUser,
      accountState: 'pending_activation',
    }),
    true,
  );
  assert.equal(shouldRefreshAuthUserSnapshot(baseUser), true);
});

test('canSubmitPasswordRegistration requires matching passwords without SMS code', () => {
  assert.equal(
    canSubmitPasswordRegistration({
      nickname: 'Lingwei',
      phone: '13800000000',
      password: 'secret123',
      confirmPassword: 'secret123',
      agreed: true,
    }),
    true,
  );
  assert.equal(
    canSubmitPasswordRegistration({
      nickname: 'Lingwei',
      phone: '13800000000',
      password: 'secret123',
      confirmPassword: 'secret124',
      agreed: true,
    }),
    false,
  );
});
