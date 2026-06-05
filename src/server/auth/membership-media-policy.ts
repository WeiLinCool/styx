import {
  listActiveUserEntitlementsAt,
  type ActiveUserEntitlement,
} from '@/server/ai/model-entitlements';
import {
  getMembershipPlanVersionById,
  membershipPlanVersionRepository,
  resolvePlanVersionForEntitlement,
  type MembershipMediaLibraryPolicy,
  type MembershipPlanVersionRecord,
} from '@/server/repositories/membership-plan-versions';

export type ResolvedMembershipMediaPolicy = MembershipMediaLibraryPolicy;

export const RESTRICTIVE_MEDIA_POLICY: ResolvedMembershipMediaPolicy = {
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

function chooseMostRelevantEntitlement(
  entitlements: ActiveUserEntitlement[],
  now: Date,
) {
  return entitlements
    .filter((entitlement) => isEntitlementActive(entitlement, now))
    .filter(
      (entitlement): entitlement is ActiveUserEntitlement & { planVersionId: string } =>
        typeof entitlement.planVersionId === 'string' && entitlement.planVersionId.length > 0,
    )
    .sort((left, right) => {
      const leftExpiry = left.expiresAt
        ? new Date(left.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      const rightExpiry = right.expiresAt
        ? new Date(right.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      return rightExpiry - leftExpiry;
    })[0] ?? null;
}

export async function resolveCurrentUserMediaPolicy(
  userId: string,
  input: {
    now?: Date;
    entitlements?: ActiveUserEntitlement[];
    getEntitlements?: (userId: string, now: Date) => Promise<ActiveUserEntitlement[]>;
    versionLoader?: (versionId: string) => Promise<MembershipPlanVersionRecord | null>;
    resolveVersionByPlanCode?: (planCode: string) => Promise<MembershipPlanVersionRecord | null>;
  } = {},
): Promise<ResolvedMembershipMediaPolicy> {
  const now = input.now ?? new Date();
  const entitlements =
    input.entitlements ??
    (await (input.getEntitlements ?? listActiveUserEntitlementsAt)(userId, now));

  const activeMembership = chooseMostRelevantEntitlement(entitlements, now);
  if (activeMembership) {
    const version = await (input.versionLoader ?? getMembershipPlanVersionById)(
      activeMembership.planVersionId,
    );

    return version?.mediaLibraryPolicy ?? RESTRICTIVE_MEDIA_POLICY;
  }

  const legacyPlanCode = entitlements
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

  if (!legacyPlanCode) {
    return RESTRICTIVE_MEDIA_POLICY;
  }

  const version = await (input.resolveVersionByPlanCode ??
    ((planCode: string) =>
      resolvePlanVersionForEntitlement(planCode, {
        now,
        loader: membershipPlanVersionRepository,
      })))(legacyPlanCode);

  return version?.mediaLibraryPolicy ?? RESTRICTIVE_MEDIA_POLICY;
}
