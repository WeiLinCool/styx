import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';

import { db, schema } from '@/server/db';

export type ModelEntitlementRequirement = {
  type: 'none' | 'membership_plan' | 'benefit_code' | 'user_grant';
  value: string | null;
  label: string;
};

export type ActiveUserEntitlement = {
  planCode: string | null;
  benefitCode: string | null;
  source: string;
  startsAt: string;
  expiresAt: string | null;
};

export type ModelEntitlementResult = {
  allowed: boolean;
  basis: ModelEntitlementRequirement['type'];
  label: string;
  value: string | null;
};

function isActive(entitlement: ActiveUserEntitlement, now: Date) {
  const nowTime = now.getTime();

  return (
    new Date(entitlement.startsAt).getTime() <= nowTime &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > nowTime)
  );
}

function hasRequirementValue(requirement: ModelEntitlementRequirement) {
  return requirement.value !== null && requirement.value.trim().length > 0;
}

export function evaluateModelEntitlement(input: {
  requirements: ModelEntitlementRequirement[];
  entitlements: ActiveUserEntitlement[];
  now?: Date;
}): ModelEntitlementResult {
  const now = input.now ?? new Date();
  const requirements =
    input.requirements.length > 0
      ? input.requirements
      : [{ type: 'none', value: null, label: 'Free' } satisfies ModelEntitlementRequirement];

  for (const requirement of requirements) {
    if (requirement.type === 'none') {
      return { allowed: true, basis: 'none', label: requirement.label, value: null };
    }

    if (!hasRequirementValue(requirement)) {
      continue;
    }

    const matched = input.entitlements.some((entitlement) => {
      if (!isActive(entitlement, now)) {
        return false;
      }

      if (requirement.type === 'membership_plan') {
        return entitlement.planCode === requirement.value;
      }

      if (requirement.type === 'benefit_code') {
        return entitlement.benefitCode === requirement.value;
      }

      if (requirement.type === 'user_grant') {
        return entitlement.source === 'manual' && entitlement.benefitCode === requirement.value;
      }

      return false;
    });

    if (matched) {
      return {
        allowed: true,
        basis: requirement.type,
        label: requirement.label,
        value: requirement.value,
      };
    }
  }

  return { allowed: false, basis: 'none', label: 'No entitlement', value: null };
}

export async function listActiveUserEntitlements(userId: string): Promise<ActiveUserEntitlement[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  return listActiveUserEntitlementsAt(userId, new Date());
}

export async function listActiveUserEntitlementsAt(
  userId: string,
  now: Date,
): Promise<ActiveUserEntitlement[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const rows = await db
    .select({
      planCode: schema.membershipPlans.code,
      benefitCode: schema.benefits.code,
      source: schema.userEntitlements.source,
      startsAt: schema.userEntitlements.startsAt,
      expiresAt: schema.userEntitlements.expiresAt,
    })
    .from(schema.userEntitlements)
    .leftJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.userEntitlements.planId))
    .leftJoin(schema.benefits, eq(schema.benefits.id, schema.userEntitlements.benefitId))
    .where(
      and(
        eq(schema.userEntitlements.userId, userId),
        lte(schema.userEntitlements.startsAt, now),
        or(isNull(schema.userEntitlements.expiresAt), gt(schema.userEntitlements.expiresAt, now)),
      ),
    );

  return rows.map((row) => ({
    planCode: row.planCode,
    benefitCode: row.benefitCode,
    source: row.source,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));
}
