import { toEnterpriseUserInfo } from '@/server/enterprise/userinfo';
import { createProtectedEnterpriseJsonGet } from '@/server/enterprise/oauth-route-responses';

export const GET = createProtectedEnterpriseJsonGet({
  handleResolvedBearer(resolved) {
    return toEnterpriseUserInfo(resolved.user);
  },
});
