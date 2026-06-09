import {
  listActiveUserEntitlementsAt,
  type ActiveUserEntitlement,
} from '@/server/ai/model-entitlements';
import {
  listVersionsByPlanCode,
  type MembershipMediaLibraryPolicy,
  type MembershipPlanVersionRecord,
} from '@/server/repositories/membership-plan-versions';

export type AdminMembershipMediaPolicyResolution = {
  policy: MembershipMediaLibraryPolicy;
  sourcePlanCode: string | null;
  sourceVersionId: string | null;
  sourceVersionNumber: number | null;
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
