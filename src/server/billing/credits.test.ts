import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InsufficientCreditsError,
  assertCanAffordMinimum,
  calculateChatCreditCost,
  calculateCreditBalance,
  createMemoryCreditLedger,
  debitForAgentRun,
  validateAdjustCreditsInput,
  validateGrantCreditsInput,
} from './credits';
import {
  calculateProviderCreditCost,
  normalizeProviderUsage,
  parseProviderBillingRules,
} from './provider-rules';

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
    3.4,
  );
});

test('calculateChatCreditCost preserves fractional minimum and usage cost to two decimals', () => {
  assert.equal(
    calculateChatCreditCost({
      usage: { promptTokens: 158, completionTokens: 0, totalTokens: 158 },
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 0.1,
        completionCreditsPer1k: 0.3,
        minimumCredits: 0.5,
      },
    }),
    0.5,
  );

  assert.equal(
    calculateChatCreditCost({
      usage: { promptTokens: 6000, completionTokens: 4000, totalTokens: 10000 },
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 0.15,
        completionCreditsPer1k: 0.35,
        minimumCredits: 0.5,
      },
    }),
    2.3,
  );
});

test('provider billing calculates DeepSeek cache-aware chat cost', () => {
  const rules = parseProviderBillingRules({
    chat: {
      mode: 'token_breakdown',
      inputCreditsPer1k: 2,
      cachedInputCreditsPer1k: 0.5,
      cacheMissInputCreditsPer1k: 2,
      outputCreditsPer1k: 8,
      minimumCredits: 1,
    },
  });

  const usage = normalizeProviderUsage({
    providerType: 'openai_compatible',
    taskType: 'chat',
    rawUsage: {
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 400,
      prompt_cache_miss_tokens: 600,
      completion_tokens: 250,
      total_tokens: 1250,
    },
    runInput: {},
  });

  assert.equal(calculateProviderCreditCost({ taskType: 'chat', usage, rules }), 3.4);
});

test('provider billing calculates Seedance video token usage with minimum', () => {
  const rules = parseProviderBillingRules({
    video: {
      mode: 'provider_usage_tokens',
      tokenCreditsPer1k: 1,
      minimumCredits: 3,
    },
  });

  const usage = normalizeProviderUsage({
    providerType: 'openai_compatible',
    taskType: 'video',
    rawUsage: { total_tokens: 1200, completion_tokens: 1200 },
    runInput: { durationSeconds: 5, resolution: '720p', ratio: '16:9' },
  });

  assert.equal(calculateProviderCreditCost({ taskType: 'video', usage, rules }), 3);
});

test('provider billing rules accept decimal minimum credits', () => {
  const rules = parseProviderBillingRules({
    chat: {
      mode: 'token_breakdown',
      inputCreditsPer1k: 0.2,
      cachedInputCreditsPer1k: 0.1,
      cacheMissInputCreditsPer1k: 0.2,
      outputCreditsPer1k: 0.4,
      minimumCredits: 0.5,
    },
    image: {
      mode: 'fixed',
      fixedCredits: 0.75,
      minimumCredits: 0.25,
    },
    video: {
      mode: 'video_seconds',
      secondsCredits: 0.5,
      minimumCredits: 1.5,
    },
  });

  assert.equal(rules.chat?.minimumCredits, 0.5);
  assert.equal(rules.image?.minimumCredits, 0.25);
  assert.equal(rules.video?.minimumCredits, 1.5);
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
    () => validateGrantCreditsInput({ amount: 1.555 }),
    /Grant amount must be a finite number with at most two decimal places\./,
  );
  assert.throws(
    () => validateGrantCreditsInput({ amount: Number.NaN }),
    /Grant amount must be a finite number with at most two decimal places\./,
  );
  assert.throws(
    () => validateGrantCreditsInput({ amount: Number.POSITIVE_INFINITY }),
    /Grant amount must be a finite number with at most two decimal places\./,
  );
  assert.doesNotThrow(() => validateGrantCreditsInput({ amount: 1.5 }));
});

test('validateAdjustCreditsInput rejects zero-value adjustments', async () => {
  assert.throws(
    () => validateAdjustCreditsInput({ amount: 0 }),
    /Adjustment amount must be non-zero\./,
  );
  assert.throws(
    () => validateAdjustCreditsInput({ amount: 1.555 }),
    /Adjustment amount must be a finite number with at most two decimal places\./,
  );
  assert.throws(
    () => validateAdjustCreditsInput({ amount: Number.NaN }),
    /Adjustment amount must be a finite number with at most two decimal places\./,
  );
  assert.throws(
    () => validateAdjustCreditsInput({ amount: Number.POSITIVE_INFINITY }),
    /Adjustment amount must be a finite number with at most two decimal places\./,
  );
  assert.doesNotThrow(() => validateAdjustCreditsInput({ amount: -0.5 }));
});

test('assertCanAffordMinimum skips database-backed billing preflight without DATABASE_URL outside production', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;

  delete env.DATABASE_URL;
  env.NODE_ENV = 'development';

  try {
    await assert.doesNotReject(() =>
      assertCanAffordMinimum('user-1', {
        unit: 'token',
        promptCreditsPer1k: 1,
        completionCreditsPer1k: 2,
        minimumCredits: 999,
      }),
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete env.DATABASE_URL;
    } else {
      env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('debitForAgentRun returns development fallback debit result without DATABASE_URL outside production', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;

  delete env.DATABASE_URL;
  env.NODE_ENV = 'development';

  try {
    const result = await debitForAgentRun({
      userId: 'user-1',
      runId: 'run-1',
      usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 1,
        completionCreditsPer1k: 2,
        minimumCredits: 3,
      },
      modelSnapshot: {
        id: 'model-1',
        code: 'free',
        name: 'Free',
      },
    });

    assert.equal(result.amount, 3);
    assert.match(result.entryId, /dev-ledger:run-1/);
    assert.equal(result.balanceAfter, 0);
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete env.DATABASE_URL;
    } else {
      env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
  }
});

test('debitForAgentRun honors explicit precomputed amount in development fallback', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;

  delete env.DATABASE_URL;
  env.NODE_ENV = 'development';

  try {
    const result = await debitForAgentRun({
      userId: 'user-1',
      runId: 'run-provider-rule',
      usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 },
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 99,
        completionCreditsPer1k: 99,
        minimumCredits: 99,
      },
      modelSnapshot: { code: 'model-1' },
      amount: 7,
    });

    assert.equal(result.amount, 7);
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete env.DATABASE_URL;
    } else {
      env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
  }
});
