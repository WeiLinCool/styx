import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';

import { resolveUserMembershipSnapshot } from './membership-snapshot';

const now = new Date('2026-06-03T12:00:00.000Z');

function createEntitlement(overrides: Partial<ActiveUserEntitlement>): ActiveUserEntitlement {
  return {
    planCode: null,
    benefitCode: null,
    source: 'membership',
    startsAt: '2026-06-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('resolveUserMembershipSnapshot returns free snapshot when there is no active membership plan', () => {
  const snapshot = resolveUserMembershipSnapshot({
    entitlements: [createEntitlement({ benefitCode: 'image-credits' })],
    now,
  });

  assert.deepEqual(snapshot, {
    membershipLevel: 'free',
    membershipExpiry: null,
    userLevel: 'free',
  });
});

test('resolveUserMembershipSnapshot maps pro monthly plan to monthly vip snapshot', () => {
  const snapshot = resolveUserMembershipSnapshot({
    entitlements: [createEntitlement({ planCode: 'pro-monthly', expiresAt: '2026-07-03T00:00:00.000Z' })],
    now,
  });

  assert.deepEqual(snapshot, {
    membershipLevel: 'monthly',
    membershipExpiry: '2026-07-03T00:00:00.000Z',
    userLevel: 'vip',
  });
});

test('resolveUserMembershipSnapshot prefers higher ranked yearly plan over monthly plan', () => {
  const snapshot = resolveUserMembershipSnapshot({
    entitlements: [
      createEntitlement({ planCode: 'pro-monthly', expiresAt: '2026-07-03T00:00:00.000Z' }),
      createEntitlement({ planCode: 'team-yearly', expiresAt: '2027-06-03T00:00:00.000Z' }),
    ],
    now,
  });

  assert.deepEqual(snapshot, {
    membershipLevel: 'yearly',
    membershipExpiry: '2027-06-03T00:00:00.000Z',
    userLevel: 'svip',
  });
});

test('resolveUserMembershipSnapshot ignores inactive entitlements', () => {
  const snapshot = resolveUserMembershipSnapshot({
    entitlements: [
      createEntitlement({ planCode: 'pro-monthly', expiresAt: '2026-06-02T00:00:00.000Z' }),
      createEntitlement({ planCode: 'team-yearly', startsAt: '2026-06-04T00:00:00.000Z' }),
    ],
    now,
  });

  assert.deepEqual(snapshot, {
    membershipLevel: 'free',
    membershipExpiry: null,
    userLevel: 'free',
  });
});
