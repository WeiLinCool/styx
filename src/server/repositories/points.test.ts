import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('shouldSkipReferralQualification returns true when referral is already qualified', () => {
  assert.equal(
    shouldSkipReferralQualification({
      qualifiedAt: '2026-05-30T00:00:00.000Z',
      rewardLedgerEntryId: 'ledger-1',
    }),
    true,
  );

  assert.equal(
    shouldSkipReferralQualification({
      qualifiedAt: null,
      rewardLedgerEntryId: null,
    }),
    false,
  );
});

test('formatRecentPointActivity normalizes ledger rows for recent activity', () => {
  assert.deepEqual(
    formatRecentPointActivity([
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
        amount: -2,
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
        amount: -2,
        reason: 'chat usage',
        createdAt: '2026-05-29T08:00:00.000Z',
      },
    ],
  );
});
