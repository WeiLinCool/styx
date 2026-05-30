import { randomBytes } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { AccountDomainError } from '@/server/auth/account-types';
import { db, schema } from '@/server/db';

function requireDb() {
  if (!db) {
    throw new AccountDomainError(
      'database_unavailable',
      'Database connection is unavailable.',
      503,
    );
  }

  return db;
}

type ReferralStatsRow = {
  qualifiedAt: string | Date | null;
  rewardAmount: number | null;
};

type ReferralQualificationRow = {
  qualifiedAt: string | Date | null;
  qualifiedBy?: 'order_paid' | 'membership_activated' | null;
} | null;

type RecentPointActivityRow = {
  id: string;
  entryType: 'grant' | 'debit' | 'adjustment';
  amount: number;
  reason: string;
  createdAt: string | Date;
};

type InviteSummaryRow = ReferralStatsRow;

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function buildInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

export function assertNotSelfReferral(input: {
  referrerUserId: string;
  referredUserId: string;
}) {
  if (input.referrerUserId === input.referredUserId) {
    throw new Error('Users cannot refer themselves.');
  }
}

export function summarizeReferralStats(rows: ReferralStatsRow[]) {
  return rows.reduce(
    (summary, row) => ({
      invitedCount: summary.invitedCount + 1,
      qualifiedCount: summary.qualifiedCount + (row.qualifiedAt ? 1 : 0),
      rewardedPoints: summary.rewardedPoints + (row.rewardAmount ?? 0),
    }),
    {
      invitedCount: 0,
      qualifiedCount: 0,
      rewardedPoints: 0,
    },
  );
}

export function shouldSkipReferralQualification(row: ReferralQualificationRow) {
  return Boolean(row?.qualifiedAt && row?.qualifiedBy);
}

export function formatRecentPointActivity(rows: RecentPointActivityRow[]) {
  return rows.map((row) => ({
    id: row.id,
    entryType: row.entryType,
    amount: row.amount,
    reason: row.reason,
    createdAt: toIsoString(row.createdAt),
  }));
}

export async function getOrCreateUserInviteCode(userId: string) {
  const database = requireDb();

  const [existing] = await database
    .select()
    .from(schema.userInviteCodes)
    .where(
      and(
        eq(schema.userInviteCodes.userId, userId),
        eq(schema.userInviteCodes.status, 'active'),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.userInviteCodes)
      .where(
        and(
          eq(schema.userInviteCodes.userId, userId),
          eq(schema.userInviteCodes.status, 'active'),
        ),
      )
      .limit(1);

    if (current) {
      return current;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = buildInviteCode();
      const [created] = await tx
        .insert(schema.userInviteCodes)
        .values({
          userId,
          code,
          status: 'active',
        })
        .onConflictDoNothing()
        .returning();

      if (created) {
        return created;
      }
    }

    throw new Error('Invite code could not be persisted.');
  });
}

export async function bindReferralForUser(input: {
  referrerUserId: string;
  referredUserId: string;
  inviteCodeId?: string | null;
  inviteCodeSnapshot?: string | null;
}) {
  assertNotSelfReferral(input);

  const database = requireDb();
  const now = new Date();

  const [referral] = await database
    .insert(schema.userReferrals)
    .values({
      referrerUserId: input.referrerUserId,
      referredUserId: input.referredUserId,
      inviteCodeId: input.inviteCodeId ?? null,
      inviteCodeSnapshot: input.inviteCodeSnapshot ?? null,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (referral) {
    return referral;
  }

  return getReferralByReferredUserId(input.referredUserId);
}

export async function getReferralByReferredUserId(userId: string) {
  const database = requireDb();
  const [referral] = await database
    .select()
    .from(schema.userReferrals)
    .where(eq(schema.userReferrals.referredUserId, userId))
    .limit(1);

  return referral ?? null;
}

export async function markReferralQualified(input: {
  referredUserId: string;
  qualifiedBy: 'order_paid' | 'membership_activated';
  rewardLedgerEntryId?: string | null;
  qualifiedAt?: Date;
}) {
  const database = requireDb();
  const existing = await getReferralByReferredUserId(input.referredUserId);
  if (!existing) {
    return null;
  }

  if (shouldSkipReferralQualification(existing)) {
    return existing;
  }

  const qualifiedAt = input.qualifiedAt ?? new Date();
  const [updated] = await database
    .update(schema.userReferrals)
    .set({
      qualifiedAt,
      qualifiedBy: input.qualifiedBy,
      rewardLedgerEntryId: input.rewardLedgerEntryId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.userReferrals.id, existing.id),
        isNull(schema.userReferrals.qualifiedAt),
        isNull(schema.userReferrals.qualifiedBy),
      ),
    )
    .returning();

  return updated ?? (await getReferralByReferredUserId(input.referredUserId));
}

export async function createDailyCheckinRecord(input: {
  userId: string;
  date: string;
  streakCount: number;
  rewardLedgerEntryId?: string | null;
}) {
  const database = requireDb();
  const [checkin] = await database
    .insert(schema.userDailyCheckins)
    .values({
      userId: input.userId,
      checkinDate: input.date,
      streakCount: input.streakCount,
      rewardLedgerEntryId: input.rewardLedgerEntryId ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (checkin) {
    return checkin;
  }

  return getTodayDailyCheckin(input.userId, input.date);
}

export async function getTodayDailyCheckin(userId: string, date: string) {
  const database = requireDb();
  const [checkin] = await database
    .select()
    .from(schema.userDailyCheckins)
    .where(
      and(
        eq(schema.userDailyCheckins.userId, userId),
        eq(schema.userDailyCheckins.checkinDate, date),
      ),
    )
    .limit(1);

  return checkin ?? null;
}

export async function listRecentPointActivity(userId: string, limit: number) {
  const database = requireDb();
  const rows = await database
    .select({
      id: schema.creditLedgerEntries.id,
      entryType: schema.creditLedgerEntries.entryType,
      amount: schema.creditLedgerEntries.amount,
      reason: schema.creditLedgerEntries.reason,
      createdAt: schema.creditLedgerEntries.createdAt,
    })
    .from(schema.creditLedgerEntries)
    .where(eq(schema.creditLedgerEntries.userId, userId))
    .orderBy(desc(schema.creditLedgerEntries.createdAt))
    .limit(limit);

  return formatRecentPointActivity(rows);
}

export async function getInviteSummary(userId: string) {
  const database = requireDb();
  const inviteCode = await getOrCreateUserInviteCode(userId);
  const rows = await database
    .select({
      qualifiedAt: schema.userReferrals.qualifiedAt,
      rewardAmount: schema.creditLedgerEntries.amount,
    })
    .from(schema.userReferrals)
    .leftJoin(
      schema.creditLedgerEntries,
      eq(schema.userReferrals.rewardLedgerEntryId, schema.creditLedgerEntries.id),
    )
    .where(eq(schema.userReferrals.referrerUserId, userId));

  return {
    inviteCode: inviteCode.code,
    ...summarizeReferralStats(rows as InviteSummaryRow[]),
  };
}
