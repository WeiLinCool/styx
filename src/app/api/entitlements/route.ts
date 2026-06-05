import { resolveEnterpriseEntitlements } from '@/server/enterprise/entitlements';
import { createProtectedEnterpriseJsonGet } from '@/server/enterprise/oauth-route-responses';

export const GET = createProtectedEnterpriseJsonGet({
  async handleResolvedBearer(resolved) {
    return resolveEnterpriseEntitlements(resolved.user.id);
  },
});
