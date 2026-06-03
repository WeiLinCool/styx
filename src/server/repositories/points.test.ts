import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNotSelfReferral,
  formatRecentPointActivity,
  shouldSkipReferralQualification,
  summarizeReferralStats,
} from './points';

test('summarizeReferralStats totals invited, qualified, and rewarded points', () => {
  assert.deepEqual(
    summarizeReferralStats([
      { qualifiedAt: '2026-05-30T00:00:00.000Z', rewardAmount: 200 },
      { qualifiedAt: null, rewardAmount: 0 },
    ]),
    { invitedCount: 2, qualifiedCount: 1, rewardedPoints: 200 },
  );
});

test('summarizeReferralStats normalizes numeric reward strings from ledger rows', () => {
  assert.deepEqual(
    summarizeReferralStats([
      { qualifiedAt: '2026-05-30T00:00:00.000Z', rewardAmount: '3.00' },
      { qualifiedAt: null, rewardAmount: '-0.50' },
    ]),
    { invitedCount: 2, qualifiedCount: 1, rewardedPoints: 2.5 },
  );
});

test('shouldSkipReferralQualification returns true when referral is already qualified', () => {
  assert.equal(
    shouldSkipReferralQualification({
      qualifiedAt: '2026-05-30T00:00:00.000Z',
      qualifiedBy: 'order_paid',
    }),
    true,
  );

  assert.equal(
    shouldSkipReferralQualification({
      qualifiedAt: null,
      qualifiedBy: 'membership_activated',
    }),
    false,
  );

  assert.equal(
    shouldSkipReferralQualification({
      qualifiedAt: '2026-05-30T00:00:00.000Z',
      qualifiedBy: null,
    }),
    false,
  );

  assert.equal(
    shouldSkipReferralQualification({
      qualifiedAt: null,
      qualifiedBy: null,
    }),
    false,
  );
});

test('assertNotSelfReferral rejects matching referrer and referred users', () => {
  assert.throws(
    () =>
      assertNotSelfReferral({
        referrerUserId: 'user-1',
        referredUserId: 'user-1',
      }),
    /cannot refer themselves/i,
  );

  assert.doesNotThrow(() =>
    assertNotSelfReferral({
      referrerUserId: 'user-1',
      referredUserId: 'user-2',
    }),
  );
});

test('formatRecentPointActivity normalizes ledger rows for recent activity', () => {
  assert.deepEqual(
    formatRecentPointActivity([
      {
        id: 'entry-1',
        entryType: 'grant',
        amount: '3.00',
        reason: 'daily check-in',
        createdAt: '2026-05-30T08:00:00.000Z',
      },
      {
        id: 'entry-2',
        entryType: 'debit',
        amount: '-0.50',
        reason: 'chat usage',
        createdAt: new Date('2026-05-29T08:00:00.000Z'),
      },
    ]),
    [
      {
        id: 'entry-1',
        entryType: 'grant',
        amount: 3,
        reason: 'daily check-in',
        createdAt: '2026-05-30T08:00:00.000Z',
      },
      {
        id: 'entry-2',
        entryType: 'debit',
        amount: -0.5,
        reason: 'chat usage',
        createdAt: '2026-05-29T08:00:00.000Z',
      },
    ],
  );
});
