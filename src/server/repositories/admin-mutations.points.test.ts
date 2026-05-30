import assert from 'node:assert/strict';
import test from 'node:test';

import {
  qualifyReferralReward,
  shouldQualifyReferralFromOrderStatusChange,
  type ReferralQualificationSource,
} from './admin-mutations';

type ReferralRecord = {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  qualifiedAt: Date | null;
  qualifiedBy: ReferralQualificationSource | null;
  rewardLedgerEntryId: string | null;
};

function createQualificationHarness(initialReferral: Partial<ReferralRecord> | null = {}) {
  const referral: ReferralRecord | null =
    initialReferral === null
      ? null
      : {
          id: initialReferral.id ?? 'referral-1',
          referrerUserId: initialReferral.referrerUserId ?? 'referrer-1',
          referredUserId: initialReferral.referredUserId ?? 'referred-1',
          qualifiedAt: initialReferral.qualifiedAt ?? null,
          qualifiedBy: initialReferral.qualifiedBy ?? null,
          rewardLedgerEntryId: initialReferral.rewardLedgerEntryId ?? null,
        };

  const grants: Array<{
    userId: string;
    amount: number;
    idempotencyKey: string;
    reason: string;
    metadata: Record<string, unknown>;
  }> = [];

  return {
    grants,
    async qualify(qualifiedBy: ReferralQualificationSource) {
      return qualifyReferralReward(
        {
          referredUserId: referral?.referredUserId ?? 'referred-1',
          qualifiedBy,
        },
        {
          async getReferralByReferredUserId() {
            return referral;
          },
          async grantCredits(input) {
            grants.push(input);
            return { entryId: `ledger-${grants.length}`, balanceAfter: 200 * grants.length };
          },
          async markReferralQualified(input) {
            if (!referral || referral.qualifiedAt || referral.qualifiedBy) {
              return referral;
            }

            referral.qualifiedAt = new Date('2026-05-30T00:00:00.000Z');
            referral.qualifiedBy = input.qualifiedBy;
            referral.rewardLedgerEntryId = input.rewardLedgerEntryId ?? null;
            return referral;
          },
          buildReferralRewardKey(referredUserId) {
            return `referral-reward:referred-user:${referredUserId}`;
          },
        },
      );
    },
  };
}

test('qualifying from paid order grants +200 with referred-user idempotency key', async () => {
  const harness = createQualificationHarness();

  const result = await harness.qualify('order_paid');

  assert.equal(result.qualified, true);
  assert.equal(harness.grants.length, 1);
  assert.deepEqual(harness.grants[0], {
    userId: 'referrer-1',
    amount: 200,
    idempotencyKey: 'referral-reward:referred-user:referred-1',
    reason: 'referral reward',
    metadata: {
      referredUserId: 'referred-1',
      referralId: 'referral-1',
      qualifiedBy: 'order_paid',
    },
  });
});

test('qualifyReferralReward ignores repeated qualification after first success', async () => {
  const harness = createQualificationHarness();

  const first = await harness.qualify('order_paid');
  const second = await harness.qualify('membership_activated');

  assert.equal(first.qualified, true);
  assert.equal(second.qualified, false);
  assert.equal(harness.grants.length, 1);
});

test('qualifying from membership activation blocks a later paid-order attempt', async () => {
  const harness = createQualificationHarness();

  const first = await harness.qualify('membership_activated');
  const second = await harness.qualify('order_paid');

  assert.equal(first.qualified, true);
  assert.equal(second.qualified, false);
  assert.equal(harness.grants.length, 1);
});

test('shouldQualifyReferralFromOrderStatusChange only triggers on transition into paid', () => {
  assert.equal(shouldQualifyReferralFromOrderStatusChange('pending', 'paid'), true);
  assert.equal(shouldQualifyReferralFromOrderStatusChange('paid', 'paid'), false);
  assert.equal(shouldQualifyReferralFromOrderStatusChange('fulfilled', 'paid'), true);
  assert.equal(shouldQualifyReferralFromOrderStatusChange('paid', 'refunded'), false);
});
