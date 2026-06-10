import {
  listActiveUserEntitlementsAt,
  type ActiveUserEntitlement,
} from '@/server/ai/model-entitlements';
import { db, schema } from '@/server/db';
import {
  listVersionsByPlanCode,
  type MembershipMediaLibraryPolicy,
  type MembershipPlanVersionRecord,
} from '@/server/repositories/membership-plan-versions';
import { applyMembershipMediaQuota, type UserStorageQuotaSnapshot } from '@/server/repositories/users';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';

export type AdminMembershipMediaPolicyResolution = {
  policy: MembershipMediaLibraryPolicy;
  sourcePlanCode: string | null;
  sourceVersionId: string | null;
  sourceVersionNumber: number | null;
};

export type AdminMembershipMediaPolicyResyncResult = AdminMembershipMediaPolicyResolution & {
  quota: UserStorageQuotaSnapshot | null;
  updatedEntitlementCount: number;
};

export const RESTRICTIVE_MEDIA_POLICY: MembershipMediaLibraryPolicy = {
  storageQuotaBytes: 0,
  allowUserUpload: false,
  allowPublicSharing: false,
};

function isEntitlementActive(entitlement: ActiveUserEntitlement, now: Date) {
  const nowTime = now.getTime();
  return (
    new Date(entitlement.startsAt).getTime() <= nowTime &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > nowTime)
  );
}

function chooseMostRelevantActivePlanCode(
  entitlements: ActiveUserEntitlement[],
  now: Date,
) {
  return entitlements
    .filter((entitlement) => isEntitlementActive(entitlement, now))
    .filter(
      (entitlement): entitlement is ActiveUserEntitlement & { planCode: string } =>
        typeof entitlement.planCode === 'string' && entitlement.planCode.length > 0,
    )
    .sort((left, right) => {
      const leftExpiry = left.expiresAt
        ? new Date(left.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      const rightExpiry = right.expiresAt
        ? new Date(right.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      return rightExpiry - leftExpiry;
    })[0]?.planCode;
}

async function resolveLatestPublishedVersionByPlanCode(planCode: string) {
  const versions = await listVersionsByPlanCode(planCode);
  return (
    versions
      .filter((version) => version.status === 'published')
      .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
  );
}

async function syncActiveMembershipEntitlementVersion(input: {
  userId: string;
  sourcePlanCode: string;
  targetVersionId: string;
  now: Date;
}) {
  if (!db) {
    return 0;
  }

  const [plan] = await db
    .select({ id: schema.membershipPlans.id })
    .from(schema.membershipPlans)
    .where(eq(schema.membershipPlans.code, input.sourcePlanCode))
    .limit(1);

  if (!plan) {
    return 0;
  }

  const result = await db
    .update(schema.userEntitlements)
    .set({
      planVersionId: input.targetVersionId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.userEntitlements.userId, input.userId),
        eq(schema.userEntitlements.source, 'membership'),
        eq(schema.userEntitlements.planId, plan.id),
        lte(schema.userEntitlements.startsAt, input.now),
        or(isNull(schema.userEntitlements.expiresAt), gt(schema.userEntitlements.expiresAt, input.now)),
      ),
    );

  return result.rowCount ?? 0;
}

export async function resolveAdminResyncMembershipMediaPolicy(
  userId: string,
  input: {
    now?: Date;
    entitlements?: ActiveUserEntitlement[];
    getEntitlements?: (userId: string, now: Date) => Promise<ActiveUserEntitlement[]>;
    resolveLatestPublishedVersionByPlanCode?: (
      planCode: string,
    ) => Promise<MembershipPlanVersionRecord | null>;
  } = {},
): Promise<AdminMembershipMediaPolicyResolution> {
  const now = input.now ?? new Date();
  const entitlements =
    input.entitlements ??
    (await (input.getEntitlements ?? listActiveUserEntitlementsAt)(userId, now));

  const planCode = chooseMostRelevantActivePlanCode(entitlements, now);
  if (!planCode) {
    return {
      policy: RESTRICTIVE_MEDIA_POLICY,
      sourcePlanCode: null,
      sourceVersionId: null,
      sourceVersionNumber: null,
    };
  }

  const version = await (input.resolveLatestPublishedVersionByPlanCode ??
    resolveLatestPublishedVersionByPlanCode)(planCode);

  if (!version) {
    throw new Error(`No published membership version found for ${planCode}`);
  }

  return {
    policy: version.mediaLibraryPolicy,
    sourcePlanCode: planCode,
    sourceVersionId: version.id,
    sourceVersionNumber: version.versionNumber,
  };
}

export async function resyncAdminMembershipMediaPolicy(
  userId: string,
  input: {
    now?: Date;
    entitlements?: ActiveUserEntitlement[];
    getEntitlements?: (userId: string, now: Date) => Promise<ActiveUserEntitlement[]>;
    resolveLatestPublishedVersionByPlanCode?: (
      planCode: string,
    ) => Promise<MembershipPlanVersionRecord | null>;
    applyMembershipMediaQuota?: (
      userId: string,
      storageQuotaBytes: number,
    ) => Promise<UserStorageQuotaSnapshot | null>;
    syncActiveMembershipEntitlementVersion?: (input: {
      userId: string;
      sourcePlanCode: string;
      targetVersionId: string;
      now: Date;
    }) => Promise<number>;
  } = {},
): Promise<AdminMembershipMediaPolicyResyncResult> {
  const now = input.now ?? new Date();
  const resolution = await resolveAdminResyncMembershipMediaPolicy(userId, input);
  const quota = await (input.applyMembershipMediaQuota ?? applyMembershipMediaQuota)(
    userId,
    resolution.policy.storageQuotaBytes,
  );

  const updatedEntitlementCount =
    resolution.sourcePlanCode && resolution.sourceVersionId
      ? await (input.syncActiveMembershipEntitlementVersion ?? syncActiveMembershipEntitlementVersion)(
          {
            userId,
            sourcePlanCode: resolution.sourcePlanCode,
            targetVersionId: resolution.sourceVersionId,
            now,
          },
        )
      : 0;

  return {
    ...resolution,
    quota,
    updatedEntitlementCount,
  };
}
