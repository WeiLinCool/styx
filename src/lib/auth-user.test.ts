import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldReplaceAuthUser } from './auth-user';
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
