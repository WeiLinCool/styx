import { randomUUID } from 'node:crypto';

import type { ServerCache } from '@/server/cache/server-cache';
import { getServerCache } from '@/server/cache/server-cache';

const TOKEN_TTL_MS = 5 * 60 * 1000;

type StoredVerificationToken = {
  userId: string;
  createdAt: string;
};

export function buildCheckinVerificationTokenKey(userId: string, token: string) {
  return `checkin-verification:${userId}:${token}`;
}

export async function createHumanVerificationToken(input: {
  cache?: ServerCache;
  userId: string;
  createId?: () => string;
  now?: () => Date;
}): Promise<string> {
  const cache = input.cache ?? getServerCache();
  const token = input.createId?.() ?? randomUUID();
  const now = input.now?.() ?? new Date();
  const storedToken: StoredVerificationToken = {
    userId: input.userId,
    createdAt: now.toISOString(),
  };

  await cache.setJson(
    buildCheckinVerificationTokenKey(input.userId, token),
    storedToken,
    TOKEN_TTL_MS,
  );

  return token;
}

export async function consumeCheckinVerificationToken(input: {
  cache?: ServerCache;
  userId: string;
  token: string;
}) {
  const cache = input.cache ?? getServerCache();
  const stored = await cache.consumeJson<StoredVerificationToken>(
    buildCheckinVerificationTokenKey(input.userId, input.token),
  );

  return Boolean(stored && stored.userId === input.userId);
}
