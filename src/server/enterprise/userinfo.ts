import type { UserRecord } from '@/server/auth/account-types';

export type EnterpriseUserInfo = {
  sub: string;
  email?: string;
  name: string;
  preferred_username: string;
};

export function toEnterpriseUserInfo(
  user: Pick<UserRecord, 'id' | 'email' | 'phone' | 'displayName'>,
): EnterpriseUserInfo {
  return {
    sub: user.id,
    email: user.email ?? undefined,
    name: user.displayName,
    preferred_username: user.email ?? user.phone ?? user.id,
  };
}
