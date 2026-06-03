import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import type { UserInfo } from '@/lib/cookie';

type MembershipSnapshot = Pick<UserInfo, 'membershipLevel' | 'membershipExpiry' | 'userLevel'>;

const defaultMembershipSnapshot: MembershipSnapshot = {
  membershipLevel: 'free',
  membershipExpiry: null,
  userLevel: 'free',
};

const planSnapshots: Record<string, MembershipSnapshot & { rank: number }> = {
  'pro-monthly': {
    membershipLevel: 'monthly',
    membershipExpiry: null,
    userLevel: 'vip',
    rank: 1,
  },
  'team-yearly': {
    membershipLevel: 'yearly',
    membershipExpiry: null,
    userLevel: 'svip',
    rank: 2,
  },
};

function isEntitlementActive(entitlement: ActiveUserEntitlement, now: Date) {
  const nowTime = now.getTime();
  return (
    new Date(entitlement.startsAt).getTime() <= nowTime &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > nowTime)
  );
}

export function resolveUserMembershipSnapshot(input: {
  entitlements: ActiveUserEntitlement[];
  now?: Date;
}): MembershipSnapshot {
  const now = input.now ?? new Date();
  const candidates = input.entitlements
    .filter((entitlement) => isEntitlementActive(entitlement, now))
    .map((entitlement) => {
      const planCode = entitlement.planCode;
      if (!planCode) {
        return null;
      }

      const snapshot = planSnapshots[planCode];
      if (!snapshot) {
        return null;
      }

      return {
        ...snapshot,
        membershipExpiry: entitlement.expiresAt,
      };
    })
    .filter((candidate): candidate is MembershipSnapshot & { rank: number } => candidate !== null)
    .sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }

      const leftExpiry = left.membershipExpiry ? new Date(left.membershipExpiry).getTime() : Number.POSITIVE_INFINITY;
      const rightExpiry = right.membershipExpiry ? new Date(right.membershipExpiry).getTime() : Number.POSITIVE_INFINITY;
      return rightExpiry - leftExpiry;
    });

  const current = candidates[0];
  if (!current) {
    return defaultMembershipSnapshot;
  }

  return {
    membershipLevel: current.membershipLevel,
    membershipExpiry: current.membershipExpiry,
    userLevel: current.userLevel,
  };
}
