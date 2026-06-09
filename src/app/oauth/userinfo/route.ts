import { toEnterpriseUserInfo } from '@/server/enterprise/userinfo';
import { createProtectedEnterpriseJsonGet } from '@/server/enterprise/oauth-route-responses';
import { resolveEnterpriseBearerToken } from '@/server/enterprise/oauth';
import { getCreditBalance } from '@/server/billing/credits';

export type EnterpriseUserInfoRouteDeps = {
  resolveEnterpriseBearerToken?: typeof resolveEnterpriseBearerToken;
  getCreditBalance?: typeof getCreditBalance;
};

export function createEnterpriseUserInfoRouteGet({
  resolveEnterpriseBearerToken: resolveBearer = resolveEnterpriseBearerToken,
  getCreditBalance: getPoints = getCreditBalance,
}: EnterpriseUserInfoRouteDeps = {}) {
  return createProtectedEnterpriseJsonGet({
    resolveEnterpriseBearerToken: resolveBearer,
    async handleResolvedBearer(resolved) {
      const points = await getPoints(resolved.user.id);
      return toEnterpriseUserInfo({ ...resolved.user, points });
    },
  });
}

export const GET = createEnterpriseUserInfoRouteGet();
