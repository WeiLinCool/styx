import { and, eq, isNull } from 'drizzle-orm';

import {
  AccountDomainError,
  type AccountState,
  type ActivationTokenPurpose,
  type BindIdentityInput,
  type IdentityProvider,
  type UserIdentityRecord,
} from '@/server/auth/account-types';
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
