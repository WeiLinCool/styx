import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { db, schema } from '@/server/db';

export type EnterpriseAuthorizationCodeRecord = {
  id: string;
  userId: string;
  codeHash: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EnterpriseAccessTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  clientId: string;
  scope: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEnterpriseAuthorizationCodeInput = {
  userId: string;
  codeHash: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
  state?: string | null;
  expiresAt: Date;
  now?: Date;
};

export type CreateEnterpriseAccessTokenInput = {
  userId: string;
  tokenHash: string;
  clientId: string;
  scope?: string;
  expiresAt: Date;
  now?: Date;
};

export type EnterpriseOAuthRepository = {
  createEnterpriseAuthorizationCode(
    input: CreateEnterpriseAuthorizationCodeInput,
  ): Promise<EnterpriseAuthorizationCodeRecord>;
  consumeEnterpriseAuthorizationCode(
    codeHash: string,
    now?: Date,
  ): Promise<EnterpriseAuthorizationCodeRecord | null>;
  createEnterpriseAccessToken(
    input: CreateEnterpriseAccessTokenInput,
  ): Promise<EnterpriseAccessTokenRecord>;
  getEnterpriseAccessTokenByHash(
    tokenHash: string,
    now?: Date,
  ): Promise<EnterpriseAccessTokenRecord | null>;
};

export function createInMemoryEnterpriseOAuthRepository(): EnterpriseOAuthRepository {
  const authorizationCodes = new Map<string, EnterpriseAuthorizationCodeRecord>();
  const accessTokens = new Map<string, EnterpriseAccessTokenRecord>();

  return {
    async createEnterpriseAuthorizationCode(input) {
      const createdAt = input.now ?? new Date();
      const record: EnterpriseAuthorizationCodeRecord = {
        id: randomUUID(),
        userId: input.userId,
        codeHash: input.codeHash,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod,
        scope: input.scope ?? '',
        state: input.state ?? null,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt,
        updatedAt: createdAt,
      };
      authorizationCodes.set(record.codeHash, cloneAuthorizationCode(record));
      return cloneAuthorizationCode(record);
    },

    async consumeEnterpriseAuthorizationCode(codeHash, consumedAt = new Date()) {
      const existing = authorizationCodes.get(codeHash);
      if (!existing || existing.consumedAt || existing.expiresAt <= consumedAt) {
        return null;
      }

      const consumed: EnterpriseAuthorizationCodeRecord = {
        ...existing,
        consumedAt,
        updatedAt: consumedAt,
      };
      authorizationCodes.set(codeHash, cloneAuthorizationCode(consumed));
      return cloneAuthorizationCode(consumed);
    },

    async createEnterpriseAccessToken(input) {
      const createdAt = input.now ?? new Date();
      const record: EnterpriseAccessTokenRecord = {
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        clientId: input.clientId,
        scope: input.scope ?? '',
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdAt,
        updatedAt: createdAt,
      };
      accessTokens.set(record.tokenHash, cloneAccessToken(record));
      return cloneAccessToken(record);
    },

    async getEnterpriseAccessTokenByHash(tokenHash, now = new Date()) {
      const existing = accessTokens.get(tokenHash);
      if (!existing || existing.revokedAt || existing.expiresAt <= now) {
        return null;
      }
      return cloneAccessToken(existing);
    },
  };
}

export function createDatabaseEnterpriseOAuthRepository(): EnterpriseOAuthRepository | null {
  if (!db || !process.env.DATABASE_URL) {
    return null;
  }

  return {
    async createEnterpriseAuthorizationCode(input) {
      const createdAt = input.now ?? new Date();
      const [record] = await db!
        .insert(schema.enterpriseOauthAuthorizationCodes)
        .values({
          userId: input.userId,
          codeHash: input.codeHash,
          clientId: input.clientId,
          redirectUri: input.redirectUri,
          codeChallenge: input.codeChallenge,
          codeChallengeMethod: input.codeChallengeMethod,
          scope: input.scope ?? '',
          state: input.state ?? null,
          expiresAt: input.expiresAt,
          createdAt,
          updatedAt: createdAt,
        })
        .returning();
      return record;
    },

    async consumeEnterpriseAuthorizationCode(codeHash, consumedAt = new Date()) {
      const [record] = await db!
        .update(schema.enterpriseOauthAuthorizationCodes)
        .set({ consumedAt, updatedAt: consumedAt })
        .where(
          and(
            eq(schema.enterpriseOauthAuthorizationCodes.codeHash, codeHash),
            isNull(schema.enterpriseOauthAuthorizationCodes.consumedAt),
            gt(schema.enterpriseOauthAuthorizationCodes.expiresAt, consumedAt),
          ),
        )
        .returning();
      return record ?? null;
    },

    async createEnterpriseAccessToken(input) {
      const createdAt = input.now ?? new Date();
      const [record] = await db!
        .insert(schema.enterpriseOauthAccessTokens)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          clientId: input.clientId,
          scope: input.scope ?? '',
          expiresAt: input.expiresAt,
          createdAt,
          updatedAt: createdAt,
        })
        .returning();
      return record;
    },

    async getEnterpriseAccessTokenByHash(tokenHash, now = new Date()) {
      const [record] = await db!
        .select()
        .from(schema.enterpriseOauthAccessTokens)
        .where(
          and(
            eq(schema.enterpriseOauthAccessTokens.tokenHash, tokenHash),
            isNull(schema.enterpriseOauthAccessTokens.revokedAt),
            gt(schema.enterpriseOauthAccessTokens.expiresAt, now),
          ),
        )
        .limit(1);
      return record ?? null;
    },
  };
}

const fallbackRepository = createInMemoryEnterpriseOAuthRepository();
let resolvedRepository: EnterpriseOAuthRepository | null = null;

export function getEnterpriseOAuthRepository(): EnterpriseOAuthRepository {
  if (resolvedRepository) {
    return resolvedRepository;
  }

  resolvedRepository = createDatabaseEnterpriseOAuthRepository() ?? fallbackRepository;
  return resolvedRepository;
}

export function createEnterpriseAuthorizationCode(
  input: CreateEnterpriseAuthorizationCodeInput,
) {
  return getEnterpriseOAuthRepository().createEnterpriseAuthorizationCode(input);
}

export function consumeEnterpriseAuthorizationCode(codeHash: string, now?: Date) {
  return getEnterpriseOAuthRepository().consumeEnterpriseAuthorizationCode(codeHash, now);
}

export function createEnterpriseAccessToken(input: CreateEnterpriseAccessTokenInput) {
  return getEnterpriseOAuthRepository().createEnterpriseAccessToken(input);
}

export function getEnterpriseAccessTokenByHash(tokenHash: string, now?: Date) {
  return getEnterpriseOAuthRepository().getEnterpriseAccessTokenByHash(tokenHash, now);
}

function cloneAuthorizationCode(
  record: EnterpriseAuthorizationCodeRecord,
): EnterpriseAuthorizationCodeRecord {
  return {
    ...record,
    expiresAt: new Date(record.expiresAt),
    consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function cloneAccessToken(record: EnterpriseAccessTokenRecord): EnterpriseAccessTokenRecord {
  return {
    ...record,
    expiresAt: new Date(record.expiresAt),
    revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}
