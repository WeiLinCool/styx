import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InsufficientCreditsError,
  calculateChatCreditCost,
  calculateCreditBalance,
  createMemoryCreditLedger,
  validateAdjustCreditsInput,
  validateGrantCreditsInput,
} from './credits';

test('calculateChatCreditCost rounds up and respects minimum', () => {
  assert.equal(
    calculateChatCreditCost({
      usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 1,
        completionCreditsPer1k: 2,
        minimumCredits: 3,
      },
    }),
    3,
  );

  assert.equal(
    calculateChatCreditCost({
      usage: { promptTokens: 1100, completionTokens: 400, totalTokens: 1500 },
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 2,
        completionCreditsPer1k: 3,
        minimumCredits: 1,
      },
    }),
    4,
  );
});

test('memory ledger debit is idempotent by key', async () => {
  const ledger = createMemoryCreditLedger({ 'user-1': 10 });
  const first = await ledger.debit({
    userId: 'user-1',
    amount: 4,
    idempotencyKey: 'agent-run:run-1:usage',
    reason: 'chat usage',
    metadata: {},
  });
  const second = await ledger.debit({
    userId: 'user-1',
    amount: 4,
    idempotencyKey: 'agent-run:run-1:usage',
    reason: 'chat usage',
    metadata: {},
  });

  assert.equal(first.entryId, second.entryId);
  assert.equal(second.balanceAfter, 6);
  assert.equal(await ledger.getBalance('user-1'), 6);
});

test('memory ledger rejects debit when balance is insufficient', async () => {
  const ledger = createMemoryCreditLedger({ 'user-1': 2 });

  await assert.rejects(
    () =>
      ledger.debit({
        userId: 'user-1',
        amount: 3,
        idempotencyKey: 'agent-run:run-2:usage',
        reason: 'chat usage',
        metadata: {},
      }),
    InsufficientCreditsError,
  );

  assert.equal(await ledger.getBalance('user-1'), 2);
});

test('calculateCreditBalance adds legacy starting credits and ledger entries', () => {
  assert.equal(calculateCreditBalance({ legacyCredits: 100, ledgerAmount: -5 }), 95);
  assert.equal(calculateCreditBalance({ legacyCredits: 0, ledgerAmount: -5 }), -5);
  assert.equal(calculateCreditBalance({ legacyCredits: 25, ledgerAmount: 10 }), 35);
});

test('calculateCreditBalance includes positive grant amounts', () => {
  assert.equal(calculateCreditBalance({ legacyCredits: 0, ledgerAmount: 200 }), 200);
});

test('memory ledger can apply signed adjustments idempotently', async () => {
  const ledger = createMemoryCreditLedger({ 'user-1': 10 });
  const first = await ledger.adjust({
    userId: 'user-1',
    amount: 5,
    idempotencyKey: 'adjust:user-1:1',
    reason: 'manual add',
    metadata: {},
  });
  const second = await ledger.adjust({
    userId: 'user-1',
    amount: 5,
    idempotencyKey: 'adjust:user-1:1',
    reason: 'manual add',
    metadata: {},
  });

  assert.equal(first.entryId, second.entryId);
  assert.equal(first.balanceAfter, second.balanceAfter);
  assert.equal(second.balanceAfter, 15);
  assert.equal(await ledger.getBalance('user-1'), 15);
});

test('validateGrantCreditsInput rejects non-positive grant amounts', async () => {
  assert.throws(() => validateGrantCreditsInput({ amount: 0 }), /Grant amount must be positive\./);
  assert.throws(() => validateGrantCreditsInput({ amount: -1 }), /Grant amount must be positive\./);
  assert.throws(
    () => validateGrantCreditsInput({ amount: 1.5 }),
    /Grant amount must be a finite integer\./,
  );
  assert.throws(
    () => validateGrantCreditsInput({ amount: Number.NaN }),
    /Grant amount must be a finite integer\./,
  );
  assert.throws(
    () => validateGrantCreditsInput({ amount: Number.POSITIVE_INFINITY }),
    /Grant amount must be a finite integer\./,
  );
});

test('validateAdjustCreditsInput rejects zero-value adjustments', async () => {
  assert.throws(
    () => validateAdjustCreditsInput({ amount: 0 }),
    /Adjustment amount must be non-zero\./,
  );
  assert.throws(
    () => validateAdjustCreditsInput({ amount: 1.5 }),
    /Adjustment amount must be a finite integer\./,
  );
  assert.throws(
    () => validateAdjustCreditsInput({ amount: Number.NaN }),
    /Adjustment amount must be a finite integer\./,
  );
  assert.throws(
    () => validateAdjustCreditsInput({ amount: Number.POSITIVE_INFINITY }),
    /Adjustment amount must be a finite integer\./,
  );
});
