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

type CreditLedgerWriteResult = CreditLedgerDebitResult;
type CreditLedgerEntryType = 'grant' | 'debit' | 'adjustment';
type CreditLedgerMutationInput = {
  userId: string;
  amount: number;
  idempotencyKey: string;
  reason: string;
  metadata: Record<string, unknown>;
};
type CreditLedgerInsertInput = CreditLedgerMutationInput & {
  runId?: string;
  entryType: CreditLedgerEntryType;
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

export function calculateCreditBalance(input: {
  legacyCredits: number;
  ledgerAmount: number;
}): number {
  return input.legacyCredits + input.ledgerAmount;
}

function isValidCreditAmount(amount: number): boolean {
  return Number.isFinite(amount) && Number.isInteger(amount);
}

export function validateGrantCreditsInput(input: Pick<CreditLedgerMutationInput, 'amount'>): void {
  if (!isValidCreditAmount(input.amount)) {
    throw new Error('Grant amount must be a finite integer.');
  }

  if (input.amount <= 0) {
    throw new Error('Grant amount must be positive.');
  }
}

export function validateAdjustCreditsInput(
  input: Pick<CreditLedgerMutationInput, 'amount'>,
): void {
  if (!isValidCreditAmount(input.amount)) {
    throw new Error('Adjustment amount must be a finite integer.');
  }

  if (input.amount === 0) {
    throw new Error('Adjustment amount must be non-zero.');
  }
}

export function createMemoryCreditLedger(initialBalances: Record<string, number>) {
  const balances = new Map(Object.entries(initialBalances));
  const entries = new Map<string, CreditLedgerWriteResult>();

  const apply = async (input: CreditLedgerMutationInput) => {
    const existing = entries.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const balance = balances.get(input.userId) ?? 0;
    const balanceAfter = balance + input.amount;
    if (balanceAfter < 0) {
      throw new InsufficientCreditsError();
    }

    const result = { entryId: randomUUID(), balanceAfter };
    balances.set(input.userId, balanceAfter);
    entries.set(input.idempotencyKey, result);
    return result;
  };

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
      return apply({ ...input, amount: -input.amount });
    },
    async adjust(input: CreditLedgerMutationInput) {
      return apply(input);
    },
  };
}

export async function getCreditBalance(userId: string): Promise<number> {
  const database = requireCreditDatabase();
  const legacyCredits = await getLegacyCreditBalance(database, userId);
  const ledgerAmount = await getLedgerAmount(database, userId);

  return calculateCreditBalance({ legacyCredits, ledgerAmount });
}

export async function assertCanAffordMinimum(
  userId: string,
  pricing: AiModelPricing,
): Promise<void> {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
    return;
  }

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
  if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
    const amount = calculateChatCreditCost({ usage: input.usage, pricing: input.pricing });
    return {
      entryId: `dev-ledger:${input.runId}`,
      balanceAfter: 0,
      amount,
    };
  }

  const database = requireCreditDatabase();
  const idempotencyKey = `agent-run:${input.runId}:usage`;

  return database.transaction(async (tx) => {
    await tx.execute(sql`select id from ${schema.users} where id = ${input.userId} for update`);

    const existing = await findLedgerEntryByKey(tx, idempotencyKey);
    if (existing) {
      return {
        entryId: existing.id,
        balanceAfter:
          existing.balanceAfter ?? (await getCreditBalanceWithExecutor(tx, input.userId)),
        amount: Math.abs(existing.amount),
      };
    }

    const amount = calculateChatCreditCost({ usage: input.usage, pricing: input.pricing });
    const result = await insertCreditLedgerEntry(tx, {
      userId: input.userId,
      runId: input.runId,
      entryType: 'debit',
      amount: -amount,
      idempotencyKey,
      reason: 'chat usage',
      metadata: {
        usage: input.usage,
        pricing: input.pricing,
        model: input.modelSnapshot,
      },
    });

    return { ...result, amount: Math.abs(amount) };
  });
}

export async function grantCredits(input: CreditLedgerMutationInput): Promise<CreditLedgerWriteResult> {
  validateGrantCreditsInput(input);

  const database = requireCreditDatabase();

  return database.transaction(async (tx) => {
    await tx.execute(sql`select id from ${schema.users} where id = ${input.userId} for update`);
    return insertCreditLedgerEntry(tx, { ...input, entryType: 'grant' });
  });
}

export async function adjustCredits(
  input: CreditLedgerMutationInput,
): Promise<CreditLedgerWriteResult> {
  validateAdjustCreditsInput(input);

  const database = requireCreditDatabase();

  return database.transaction(async (tx) => {
    await tx.execute(sql`select id from ${schema.users} where id = ${input.userId} for update`);
    return insertCreditLedgerEntry(tx, { ...input, entryType: 'adjustment' });
  });
}

function requireCreditDatabase() {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for credit billing.');
  }

  return db;
}

type CreditDatabaseExecutor = Pick<NonNullable<typeof db>, 'select'>;
type CreditTransactionExecutor = Parameters<
  Parameters<NonNullable<typeof db>['transaction']>[0]
>[0];
type CreditExecutor = CreditDatabaseExecutor | CreditTransactionExecutor;

async function getCreditBalanceWithExecutor(
  executor: CreditExecutor,
  userId: string,
): Promise<number> {
  const legacyCredits = await getLegacyCreditBalance(executor, userId);
  const ledgerAmount = await getLedgerAmount(executor, userId);

  return calculateCreditBalance({ legacyCredits, ledgerAmount });
}

async function getLegacyCreditBalance(executor: CreditExecutor, userId: string) {
  const [user] = await executor
    .select({ metadata: schema.users.metadata })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return readLegacyCreditBalance(user?.metadata);
}

async function getLedgerAmount(executor: CreditExecutor, userId: string) {
  const [ledgerBalance] = await executor
    .select({
      amount: sql<number>`coalesce(sum(${schema.creditLedgerEntries.amount}), 0)::int`,
    })
    .from(schema.creditLedgerEntries)
    .where(eq(schema.creditLedgerEntries.userId, userId));

  return ledgerBalance?.amount ?? 0;
}

async function findLedgerEntryByKey(executor: CreditExecutor, idempotencyKey: string) {
  const [entry] = await executor
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

async function insertCreditLedgerEntry(
  executor: CreditTransactionExecutor,
  input: CreditLedgerInsertInput,
): Promise<CreditLedgerWriteResult> {
  const existing = await findLedgerEntryByKey(executor, input.idempotencyKey);
  if (existing) {
    return {
      entryId: existing.id,
      balanceAfter: existing.balanceAfter ?? (await getCreditBalanceWithExecutor(executor, input.userId)),
    };
  }

  const balance = await getCreditBalanceWithExecutor(executor, input.userId);
  const balanceAfter = balance + input.amount;
  if (balanceAfter < 0) {
    throw new InsufficientCreditsError();
  }

  const [entry] = await executor
    .insert(schema.creditLedgerEntries)
    .values({
      userId: input.userId,
      runId: input.runId ?? null,
      entryType: input.entryType,
      amount: input.amount,
      balanceAfter,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: input.metadata,
    })
    .onConflictDoNothing()
    .returning({
      id: schema.creditLedgerEntries.id,
      balanceAfter: schema.creditLedgerEntries.balanceAfter,
    });

  if (entry) {
    return { entryId: entry.id, balanceAfter };
  }

  const raced = await findLedgerEntryByKey(executor, input.idempotencyKey);
  if (!raced) {
    throw new Error('Credit ledger entry could not be persisted.');
  }

  return {
    entryId: raced.id,
    balanceAfter: raced.balanceAfter ?? (await getCreditBalanceWithExecutor(executor, input.userId)),
  };
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
