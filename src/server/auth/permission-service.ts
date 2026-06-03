import {
  type ActiveUserEntitlement,
  listActiveUserEntitlementsAt,
} from '@/server/ai/model-entitlements';
import { listPermissionCodesForMembershipPlans } from '@/server/repositories/membership-plan-permissions';
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
};

export async function listUserPermissionCodes(
  userId: string,
  overrides: PermissionLookupOverrides = {},
): Promise<string[]> {
  const now = overrides.now ?? new Date();
  const entitlements =
    overrides.entitlements ?? (await listActiveUserEntitlementsAt(userId, now));

  const activePlanCodes = [...new Set(
    entitlements
      .filter((entitlement) => isEntitlementActive(entitlement, now))
      .map((entitlement) => entitlement.planCode)
      .filter((planCode): planCode is string => typeof planCode === 'string' && planCode.length > 0),
  )];

  if (activePlanCodes.length === 0) {
    return [];
  }

  if (overrides.planPermissionCodes) {
    return [
      ...new Set(
        activePlanCodes.flatMap((planCode) => overrides.planPermissionCodes?.[planCode] ?? []),
      ),
    ].sort();
  }

  return listPermissionCodesForMembershipPlans(activePlanCodes);
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
