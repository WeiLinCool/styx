import { eq } from 'drizzle-orm';

import {
  type ActiveUserEntitlement,
  listActiveUserEntitlementsAt,
} from '@/server/ai/model-entitlements';
import { getServerCache, type ServerCache } from '@/server/cache/server-cache';
import { db, schema } from '@/server/db';
import {
  listPermissionCodesForMembershipPlans,
  listPermissionCodesForMembershipPlanVersions,
} from '@/server/repositories/membership-plan-permissions';
import { AccountDomainError } from './account-types';

function isEntitlementActive(entitlement: ActiveUserEntitlement, now: Date) {
  const nowTime = now.getTime();

  return (
    new Date(entitlement.startsAt).getTime() <= nowTime &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > nowTime)
  );
}

type PermissionLookupOverrides = {
  now?: Date;
  entitlements?: ActiveUserEntitlement[];
  planPermissionCodes?: Record<string, string[]>;
  versionPermissionCodes?: Record<string, string[]>;
  cache?: ServerCache;
  getEntitlements?: (userId: string, now: Date) => Promise<ActiveUserEntitlement[]>;
  getPlanPermissionCodes?: (planCodes: string[]) => Promise<string[]>;
  getVersionPermissionCodes?: (versionIds: string[]) => Promise<string[]>;
};

const USER_PERMISSION_CACHE_TTL_MS = 60 * 1000;

export function getUserPermissionCacheKey(userId: string) {
  return `auth:permissions:${userId}`;
}

export async function invalidateUserPermissionCache(
  userId: string,
  input: { cache?: ServerCache } = {},
) {
  const cache = input.cache ?? getServerCache();
  await cache.delete(getUserPermissionCacheKey(userId));
}

async function listUserIdsByPlanId(planId: string) {
  if (!db) {
    return [] as string[];
  }

  const rows = await db
    .select({ userId: schema.userEntitlements.userId })
    .from(schema.userEntitlements)
    .where(eq(schema.userEntitlements.planId, planId));

  return [...new Set(rows.map((row) => row.userId))];
}

async function listUserIdsByVersionId(versionId: string) {
  if (!db) {
    return [] as string[];
  }

  const rows = await db
    .select({ userId: schema.userEntitlements.userId })
    .from(schema.userEntitlements)
    .where(eq(schema.userEntitlements.planVersionId, versionId));

  return [...new Set(rows.map((row) => row.userId))];
}

export async function invalidateUserPermissionCacheForPlan(
  planId: string,
  input: {
    cache?: ServerCache;
    listUserIdsByPlanId?: (planId: string) => Promise<string[]>;
  } = {},
) {
  const userIds = await (input.listUserIdsByPlanId ?? listUserIdsByPlanId)(planId);
  await Promise.all(userIds.map((userId) => invalidateUserPermissionCache(userId, input)));
}

export async function invalidateUserPermissionCacheForVersion(
  versionId: string,
  input: {
    cache?: ServerCache;
    listUserIdsByVersionId?: (versionId: string) => Promise<string[]>;
  } = {},
) {
  const userIds = await (input.listUserIdsByVersionId ?? listUserIdsByVersionId)(versionId);
  await Promise.all(userIds.map((userId) => invalidateUserPermissionCache(userId, input)));
}

export async function listUserPermissionCodes(
  userId: string,
  overrides: PermissionLookupOverrides = {},
): Promise<string[]> {
  const now = overrides.now ?? new Date();
  const canUseCache =
    !overrides.entitlements &&
    !overrides.planPermissionCodes &&
    !overrides.versionPermissionCodes;
  const cache = overrides.cache ?? getServerCache();

  if (canUseCache) {
    const cached = await cache.getJson<string[]>(getUserPermissionCacheKey(userId));
    if (Array.isArray(cached)) {
      return cached;
    }
  }

  const entitlements =
    overrides.entitlements ??
    (await (overrides.getEntitlements ?? listActiveUserEntitlementsAt)(userId, now));

  const activePlanCodes = [...new Set(
    entitlements
      .filter((entitlement) => isEntitlementActive(entitlement, now))
      .map((entitlement) => entitlement.planCode)
      .filter((planCode): planCode is string => typeof planCode === 'string' && planCode.length > 0),
  )];

  if (activePlanCodes.length === 0) {
    return [];
  }

  const activeVersionIds = [...new Set(
    entitlements
      .filter((entitlement) => isEntitlementActive(entitlement, now))
      .map((entitlement) => entitlement.planVersionId)
      .filter((versionId): versionId is string => typeof versionId === 'string' && versionId.length > 0),
  )];

  if (overrides.versionPermissionCodes) {
    const codes = [
      ...new Set(
        activeVersionIds.flatMap((versionId) => overrides.versionPermissionCodes?.[versionId] ?? []),
      ),
    ].sort();
    if (canUseCache) {
      await cache.setJson(getUserPermissionCacheKey(userId), codes, USER_PERMISSION_CACHE_TTL_MS);
    }
    return codes;
  }

  if (activeVersionIds.length > 0 && !overrides.planPermissionCodes) {
    const versionCodes = await (overrides.getVersionPermissionCodes ??
      listPermissionCodesForMembershipPlanVersions)(activeVersionIds);
    if (versionCodes.length > 0) {
      if (canUseCache) {
        await cache.setJson(
          getUserPermissionCacheKey(userId),
          versionCodes,
          USER_PERMISSION_CACHE_TTL_MS,
        );
      }
      return versionCodes;
    }
  }

  if (overrides.planPermissionCodes) {
    const codes = [
      ...new Set(
        activePlanCodes.flatMap((planCode) => overrides.planPermissionCodes?.[planCode] ?? []),
      ),
    ].sort();
    if (canUseCache) {
      await cache.setJson(getUserPermissionCacheKey(userId), codes, USER_PERMISSION_CACHE_TTL_MS);
    }
    return codes;
  }

  const planCodes = await (overrides.getPlanPermissionCodes ?? listPermissionCodesForMembershipPlans)(
    activePlanCodes,
  );
  if (canUseCache) {
    await cache.setJson(getUserPermissionCacheKey(userId), planCodes, USER_PERMISSION_CACHE_TTL_MS);
  }
  return planCodes;
}

export async function hasUserPermission(
  userId: string,
  code: string,
  overrides: PermissionLookupOverrides = {},
) {
  const codes = await listUserPermissionCodes(userId, overrides);
  return codes.includes(code);
}

export async function hasUserAnyPermission(
  userId: string,
  codes: string[],
  overrides: PermissionLookupOverrides = {},
) {
  const permissionCodes = await listUserPermissionCodes(userId, overrides);
  return codes.some((code) => permissionCodes.includes(code));
}

export async function requireUserPermission(
  session: { user: { id: string } },
  code: string,
  overrides: PermissionLookupOverrides = {},
) {
  const allowed = await hasUserPermission(session.user.id, code, overrides);
  if (!allowed) {
    throw new AccountDomainError('permission_denied', `Permission denied: ${code}`, 403);
  }
}
