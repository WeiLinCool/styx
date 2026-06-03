import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  type AccountState,
  AccountDomainError,
  type ActivationTokenPurpose,
  type BindIdentityInput,
  type IdentityProvider,
  type UserIdentityRecord,
} from '@/server/auth/account-types';
import { recordAuditEvent } from '@/server/audit/audit-service';
import { adjustCredits } from '@/server/billing/credits';
import { db, schema } from '@/server/db';
import { formatCredits } from '@/lib/credits';
import {
  type AdminFilter,
  type AdminMetric,
  type AdminModuleData,
  ensureAdminReadSource,
  formatIso,
  metadataNumber,
  metadataText,
} from './admin-shared';

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

export async function getUserById(userId: string) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function getUserByIdentity(
  provider: IdentityProvider,
  providerSubject: string,
) {
  const database = requireDb();
  const [row] = await database
    .select({ user: schema.users })
    .from(schema.userIdentities)
    .innerJoin(schema.users, eq(schema.userIdentities.userId, schema.users.id))
    .where(
      and(
        eq(schema.userIdentities.provider, provider),
        eq(schema.userIdentities.providerSubject, providerSubject),
      ),
    )
    .limit(1);

  return row?.user ?? null;
}

export async function getUserByEmail(email: string) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  return user ?? null;
}

export async function getUserByPhone(phone: string) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, phone))
    .limit(1);

  return user ?? null;
}

export async function createUser(input: {
  email?: string | null;
  phone?: string | null;
  displayName: string;
  metadata?: Record<string, unknown>;
}) {
  const database = requireDb();
  const [user] = await database
    .insert(schema.users)
    .values({
      email: input.email ?? null,
      phone: input.phone ?? null,
      displayName: input.displayName,
      accountState: 'pending_activation',
      metadata: input.metadata ?? {},
    })
    .returning();

  return user;
}

export async function updateUserMetadata(
  userId: string,
  metadata: Record<string, unknown>,
) {
  const database = requireDb();
  const [user] = await database
    .update(schema.users)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!user) {
    throw new AccountDomainError('account_not_found', 'Account not found.', 404);
  }

  return user;
}

export async function createSession(input: {
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const database = requireDb();
  const [session] = await database
    .insert(schema.sessions)
    .values({
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();

  return session;
}

export async function revokeSessionsForUser(userId: string) {
  const database = requireDb();
  await database
    .update(schema.sessions)
    .set({
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
      ),
    );
}

export async function listUserIdentities(userId: string) {
  const database = requireDb();
  return database
    .select()
    .from(schema.userIdentities)
    .where(eq(schema.userIdentities.userId, userId));
}

export async function createActivationToken(input: {
  userId: string;
  purpose: ActivationTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  identityId?: string | null;
}) {
  const database = requireDb();
  const [token] = await database
    .insert(schema.activationTokens)
    .values({
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      identityId: input.identityId ?? null,
    })
    .returning();

  return token;
}

export async function getActivationTokenByHash(tokenHash: string) {
  const database = requireDb();
  const [token] = await database
    .select()
    .from(schema.activationTokens)
    .where(eq(schema.activationTokens.tokenHash, tokenHash))
    .limit(1);

  return token ?? null;
}

export async function consumeActivationToken(tokenHash: string) {
  const database = requireDb();
  const [token] = await database
    .update(schema.activationTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.activationTokens.tokenHash, tokenHash),
        isNull(schema.activationTokens.consumedAt),
      ),
    )
    .returning();

  return token ?? null;
}

export async function bindVerifiedIdentity(input: BindIdentityInput) {
  const database = requireDb();
  const now = new Date();
  const [existing] = await database
    .select()
    .from(schema.userIdentities)
    .where(
      and(
        eq(schema.userIdentities.provider, input.provider),
        eq(schema.userIdentities.providerSubject, input.providerSubject),
      ),
    )
    .limit(1);

  if (existing?.isVerified && existing.userId !== input.userId) {
    return {
      ok: false as const,
      error: new AccountDomainError(
        'identity_conflict',
        'Verified identity is already bound to another account.',
        409,
      ),
    };
  }

  if (existing) {
    const [identity] = await database
      .update(schema.userIdentities)
      .set({
        userId: input.userId,
        label: input.label ?? input.providerSubject,
        isVerified: true,
        verifiedAt: existing.verifiedAt ?? now,
        metadata: input.metadata ?? existing.metadata,
        updatedAt: now,
      })
      .where(eq(schema.userIdentities.id, existing.id))
      .returning();

    return { ok: true as const, identity: identity as UserIdentityRecord };
  }

  const [identity] = await database
    .insert(schema.userIdentities)
    .values({
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      label: input.label ?? input.providerSubject,
      isVerified: true,
      verifiedAt: now,
      metadata: input.metadata ?? {},
    })
    .returning();

  return { ok: true as const, identity: identity as UserIdentityRecord };
}

export async function setUserAccountState(
  userId: string,
  state: AccountState,
  _actorId?: string | null,
  reason?: string | null,
) {
  const database = requireDb();
  const now = new Date();
  const [user] = await database
    .update(schema.users)
    .set({
      accountState: state,
      activatedAt: state === 'active' ? now : undefined,
      suspendedAt: state === 'suspended' ? now : null,
      archivedAt: state === 'archived' ? now : null,
      metadata: reason ? { stateReason: reason } : undefined,
      updatedAt: now,
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!user) {
    throw new AccountDomainError('account_not_found', 'Account not found.', 404);
  }

  return user;
}

export async function getSessionByTokenHash(sessionTokenHash: string) {
  const database = requireDb();
  const [row] = await database
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.sessionTokenHash, sessionTokenHash))
    .limit(1);

  if (!row || row.session.revokedAt || row.session.expiresAt <= new Date()) {
    return null;
  }

  return row;
}

export async function listAdminRoles(userId: string) {
  const database = requireDb();
  return database
    .select()
    .from(schema.adminRoles)
    .where(eq(schema.adminRoles.userId, userId));
}

export type AdminUserRow = {
  id: string;
  displayName: string;
  primaryContact: string;
  accountState: AccountState;
  identities: string[];
  bindingState: string;
  membership: string;
  points: number;
  activity: string;
  auditSummary: string;
  createdAt: string;
  actions: string[];
};

type AdminAdjustUserPointsInput = {
  userId: string;
  actorId: string;
  amount: number;
  reason: string;
};

type AdminAdjustUserPointsDeps = {
  getUserById: (userId: string) => Promise<Awaited<ReturnType<typeof getUserById>> | null>;
  adjustCredits: typeof adjustCredits;
  recordAuditEvent: (input: Parameters<typeof recordAuditEvent>[0]) => ReturnType<typeof recordAuditEvent>;
  createIdempotencyKey: () => string;
};

const defaultAdminAdjustUserPointsDeps: AdminAdjustUserPointsDeps = {
  getUserById,
  adjustCredits,
  recordAuditEvent,
  createIdempotencyKey: () => `admin-points-adjustment:${randomUUID()}`,
};

export async function adjustUserPointsByAdmin(
  input: AdminAdjustUserPointsInput,
  deps: AdminAdjustUserPointsDeps = defaultAdminAdjustUserPointsDeps,
) {
  const user = await deps.getUserById(input.userId);
  if (!user) {
    throw new AccountDomainError('account_not_found', 'Account not found.', 404);
  }

  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error('Adjustment reason is required.');
  }

  const adjustment = await deps.adjustCredits({
    userId: input.userId,
    amount: input.amount,
    idempotencyKey: deps.createIdempotencyKey(),
    reason,
    metadata: {
      source: 'admin_manual_adjustment',
      actorId: input.actorId,
      targetUserId: input.userId,
      reason,
    },
  });

  await deps.recordAuditEvent({
    actorId: input.actorId,
    targetId: input.userId,
    type: 'user.points_adjusted',
    entityType: 'credit_ledger_entry',
    entityId: adjustment.entryId,
    metadata: {
      amount: input.amount,
      balanceAfter: adjustment.balanceAfter,
      reason,
    },
  });

  return {
    userId: input.userId,
    entryId: adjustment.entryId,
    amount: input.amount,
    balanceAfter: adjustment.balanceAfter,
    reason,
  };
}

function getSeedUsers(): AdminModuleData<AdminUserRow> {
  const records: AdminUserRow[] = [
    {
      id: 'seed-user-1',
      displayName: 'Styx Admin',
      primaryContact: 'admin@styx.local',
      accountState: 'active',
      identities: ['邮箱：已验证', 'GitHub：已验证'],
      bindingState: '2 个已验证身份',
      membership: '所有者 / 团队年付',
      points: 980,
      activity: '登录 12 次 / 近 7 天',
      auditSummary: '最近操作: seed.database',
      createdAt: '2026-05-29T08:00:00.000Z',
      actions: ['重发激活', '直接激活', '停用', '归档'],
    },
    {
      id: 'seed-user-2',
      displayName: '待激活创作者',
      primaryContact: 'pending@styx.local',
      accountState: 'pending_activation',
      identities: ['邮箱：未验证'],
      bindingState: '需要激活',
      membership: '免费 / 无有效方案',
      points: 20,
      activity: '注册后未激活',
      auditSummary: '最近操作: activation.reissued',
      createdAt: '2026-05-29T07:20:00.000Z',
      actions: ['重发激活', '直接激活', '停用', '归档'],
    },
    {
      id: 'seed-user-3',
      displayName: '视频团队账号',
      primaryContact: '+86 138 0000 0000',
      accountState: 'suspended',
      identities: ['手机：已验证', '微信：已验证'],
      bindingState: '恢复前需复核',
      membership: '专业版月付',
      points: 0,
      activity: 'AI 任务失败率过高',
      auditSummary: '最近操作: account.suspended',
      createdAt: '2026-05-28T11:10:00.000Z',
      actions: ['重发激活', '直接激活', '停用', '归档'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '总账号', value: '3', hint: '种子记录', tone: 'info' },
      { label: '待激活', value: '1', hint: '需跟进', tone: 'warning' },
      { label: '已绑定身份', value: '5', hint: '已验证 + 待处理', tone: 'success' },
      { label: '可用额度', value: '1,000', hint: '示例额度', tone: 'default' },
    ],
    filters: [
      { label: '全部', value: 'all', count: 3 },
      { label: '待激活', value: 'pending_activation', count: 1 },
      { label: '已激活', value: 'active', count: 1 },
      { label: '已停用', value: 'suspended', count: 1 },
    ],
    records,
  };
}

export async function getAdminUsers(): Promise<AdminModuleData<AdminUserRow>> {
  const database = ensureAdminReadSource('users');

  if (!database) {
    return getSeedUsers();
  }

  const rows = await database
    .select({
      user: schema.users,
      identityCount: sql<number>`count(distinct ${schema.userIdentities.id})::int`,
      verifiedIdentityCount:
        sql<number>`count(distinct ${schema.userIdentities.id}) filter (where ${schema.userIdentities.isVerified} = true)::int`,
      membership:
        sql<string>`coalesce(max(${schema.membershipPlans.name}), '免费 / 无有效方案')`,
      points: sql<number>`(
        coalesce((
          select sum(
            case
              when jsonb_typeof(u.metadata -> 'credits') = 'number'
                then (u.metadata ->> 'credits')::numeric
              else 0
            end
          )
          from ${schema.users} as u
          where u.id = ${schema.users.id}
        ), 0) +
        coalesce((
          select sum(${schema.creditLedgerEntries.amount})
          from ${schema.creditLedgerEntries}
          where ${schema.creditLedgerEntries.userId} = ${schema.users.id}
        ), 0)
      )::numeric`,
      lastAuditAction: sql<string>`coalesce(max(${schema.auditEvents.action}), 'none')`,
    })
    .from(schema.users)
    .leftJoin(schema.userIdentities, eq(schema.userIdentities.userId, schema.users.id))
    .leftJoin(schema.userEntitlements, eq(schema.userEntitlements.userId, schema.users.id))
    .leftJoin(
      schema.membershipPlans,
      eq(schema.membershipPlans.id, schema.userEntitlements.planId),
    )
    .leftJoin(schema.auditEvents, eq(schema.auditEvents.targetUserId, schema.users.id))
    .groupBy(schema.users.id)
    .orderBy(desc(schema.users.createdAt))
    .limit(50);

  const records = rows.map((row): AdminUserRow => ({
    id: row.user.id,
    displayName: row.user.displayName,
    primaryContact: row.user.email ?? row.user.phone ?? '未绑定',
    accountState: row.user.accountState,
    identities: [
      `${row.identityCount} 个身份`,
      `${row.verifiedIdentityCount} 个已验证`,
    ],
    bindingState:
      row.verifiedIdentityCount > 0
        ? `${row.verifiedIdentityCount} 个已验证身份`
        : '需要激活',
    membership: row.membership,
    points: row.points,
    activity:
      row.user.accountState === 'active'
        ? '账号已激活'
        : metadataText(row.user.metadata, 'activity', '数据库暂无活动摘要'),
    auditSummary: `最近操作: ${row.lastAuditAction}`,
    createdAt: formatIso(row.user.createdAt),
    actions: ['重发激活', '直接激活', '停用', '归档'],
  }));

  const pendingCount = records.filter((record) => record.accountState === 'pending_activation').length;
  const activeCount = records.filter((record) => record.accountState === 'active').length;
  const suspendedCount = records.filter((record) => record.accountState === 'suspended').length;
  const totalPoints = records.reduce(
    (sum, record) => sum + metadataNumber({ points: record.points }, 'points'),
    0,
  );

  const metrics: AdminMetric[] = [
    { label: '总账号', value: String(records.length), hint: '数据库', tone: 'info' },
    { label: '待激活', value: String(pendingCount), hint: '激活队列', tone: 'warning' },
    { label: '活跃账号', value: String(activeCount), hint: '已激活生命周期', tone: 'success' },
    { label: '可用积分', value: formatCredits(totalPoints), hint: '真实 ledger 余额', tone: 'default' },
  ];

  const filters: AdminFilter[] = [
    { label: '全部', value: 'all', count: records.length },
    { label: '待激活', value: 'pending_activation', count: pendingCount },
    { label: '已激活', value: 'active', count: activeCount },
    { label: '已停用', value: 'suspended', count: suspendedCount },
  ];

  return {
    source: 'database',
    metrics,
    filters,
    records,
  };
}
