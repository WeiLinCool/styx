import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InsufficientCreditsError,
  calculateChatCreditCost,
  createMemoryCreditLedger,
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
