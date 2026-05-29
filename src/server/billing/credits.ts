import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import type { AiUsage } from '@/server/agent/types';
import { db, schema } from '@/server/db';
import type { AiModelPricing, ResolvedChatModel } from '@/server/repositories/ai-models';

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Insufficient credits.');
    this.name = 'InsufficientCreditsError';
  }
}

export type CreditLedgerDebitResult = {
  entryId: string;
  balanceAfter: number;
};

export function calculateChatCreditCost(input: {
  usage: AiUsage;
  pricing: AiModelPricing;
}) {
  return Math.max(
    input.pricing.minimumCredits,
    Math.ceil(
      (input.usage.promptTokens / 1000) * input.pricing.promptCreditsPer1k +
        (input.usage.completionTokens / 1000) * input.pricing.completionCreditsPer1k,
    ),
  );
}

export function createMemoryCreditLedger(initialBalances: Record<string, number>) {
  const balances = new Map(Object.entries(initialBalances));
  const entries = new Map<string, CreditLedgerDebitResult>();

  return {
    async getBalance(userId: string) {
      return balances.get(userId) ?? 0;
    },
    async debit(input: {
      userId: string;
      amount: number;
      idempotencyKey: string;
      reason: string;
      metadata: Record<string, unknown>;
    }) {
      const existing = entries.get(input.idempotencyKey);
      if (existing) {
        return existing;
      }

      const balance = balances.get(input.userId) ?? 0;
      if (balance < input.amount) {
        throw new InsufficientCreditsError();
      }

      const result = { entryId: randomUUID(), balanceAfter: balance - input.amount };
      balances.set(input.userId, result.balanceAfter);
      entries.set(input.idempotencyKey, result);
      return result;
    },
  };
}

export async function getCreditBalance(userId: string): Promise<number> {
  const database = requireCreditDatabase();
  const [ledgerBalance] = await database
    .select({
      balance: sql<number>`coalesce(sum(${schema.creditLedgerEntries.amount}), 0)::int`,
    })
    .from(schema.creditLedgerEntries)
    .where(eq(schema.creditLedgerEntries.userId, userId));

  const balance = ledgerBalance?.balance ?? 0;
  if (balance !== 0) {
    return balance;
  }

  const [user] = await database
    .select({ metadata: schema.users.metadata })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return readLegacyCreditBalance(user?.metadata);
}

export async function assertCanAffordMinimum(
  userId: string,
  pricing: AiModelPricing,
): Promise<void> {
  const balance = await getCreditBalance(userId);
  if (balance < pricing.minimumCredits) {
    throw new InsufficientCreditsError();
  }
}

export async function debitForAgentRun(input: {
  userId: string;
  runId: string;
  usage: AiUsage;
  pricing: AiModelPricing;
  modelSnapshot: ResolvedChatModel | Record<string, unknown>;
}): Promise<CreditLedgerDebitResult & { amount: number }> {
  const database = requireCreditDatabase();
  const idempotencyKey = `agent-run:${input.runId}:usage`;
  const existing = await findLedgerEntryByKey(idempotencyKey);
  if (existing) {
    return {
      entryId: existing.id,
      balanceAfter: existing.balanceAfter ?? (await getCreditBalance(input.userId)),
      amount: Math.abs(existing.amount),
    };
  }

  const amount = calculateChatCreditCost({ usage: input.usage, pricing: input.pricing });
  const balance = await getCreditBalance(input.userId);
  if (balance < amount) {
    throw new InsufficientCreditsError();
  }

  const balanceAfter = balance - amount;
  const [entry] = await database
    .insert(schema.creditLedgerEntries)
    .values({
      userId: input.userId,
      runId: input.runId,
      entryType: 'debit',
      amount: -amount,
      balanceAfter,
      idempotencyKey,
      reason: 'chat usage',
      metadata: {
        usage: input.usage,
        pricing: input.pricing,
        model: input.modelSnapshot,
      },
    })
    .onConflictDoNothing()
    .returning({
      id: schema.creditLedgerEntries.id,
      amount: schema.creditLedgerEntries.amount,
      balanceAfter: schema.creditLedgerEntries.balanceAfter,
    });

  if (entry) {
    return { entryId: entry.id, balanceAfter, amount };
  }

  const raced = await findLedgerEntryByKey(idempotencyKey);
  if (!raced) {
    throw new Error('Credit ledger debit could not be persisted.');
  }

  return {
    entryId: raced.id,
    balanceAfter: raced.balanceAfter ?? (await getCreditBalance(input.userId)),
    amount: Math.abs(raced.amount),
  };
}

function requireCreditDatabase() {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for credit billing.');
  }

  return db;
}

async function findLedgerEntryByKey(idempotencyKey: string) {
  const database = requireCreditDatabase();
  const [entry] = await database
    .select({
      id: schema.creditLedgerEntries.id,
      amount: schema.creditLedgerEntries.amount,
      balanceAfter: schema.creditLedgerEntries.balanceAfter,
    })
    .from(schema.creditLedgerEntries)
    .where(eq(schema.creditLedgerEntries.idempotencyKey, idempotencyKey))
    .limit(1);

  return entry ?? null;
}

function readLegacyCreditBalance(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return 0;
  }

  const credits = metadata.credits;
  return typeof credits === 'number' && Number.isFinite(credits) && credits > 0
    ? Math.floor(credits)
    : 0;
}
