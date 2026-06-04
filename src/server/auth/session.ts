import { cookies, headers } from 'next/headers';
import {
  listDevAuthBypassCookieNames,
  listSessionCookieNames,
} from '@/lib/auth-cookie-names';

import {
  AccountDomainError,
  type SessionContext,
} from './account-types';
import { hashSecret } from './account-crypto';
import {
  getSessionByTokenHash,
  getUserById,
  listAdminRoles,
} from '@/server/repositories/users';

export const DEV_AUTH_BYPASS_COOKIE = 'styx_dev_auth_disabled';

export function shouldUseDevelopmentAuth(input: {
  nodeEnv: string | undefined;
  devAuthEnabled: string | undefined;
  devUserId: string | null | undefined;
  devAuthBlocked: boolean;
}) {
  if (input.nodeEnv === 'production') {
    return false;
  }

  if (input.devAuthEnabled !== 'true') {
    return false;
  }

  if (!input.devUserId) {
    return false;
  }

  return !input.devAuthBlocked;
}

function getExplicitDevelopmentUserId(devAuthBlocked: boolean) {
  return shouldUseDevelopmentAuth({
    nodeEnv: process.env.NODE_ENV,
    devAuthEnabled: process.env.STYX_ENABLE_DEV_AUTH,
    devUserId: process.env.STYX_DEV_USER_ID,
    devAuthBlocked,
  })
    ? process.env.STYX_DEV_USER_ID ?? null
    : null;
}

export async function resolveSession(): Promise<SessionContext> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  const sessionToken = listSessionCookieNames(host).map((name) => cookieStore.get(name)?.value).find(
    Boolean,
  );

  if (sessionToken) {
    const session = await getSessionByTokenHash(hashSecret(sessionToken));
    if (session) {
      const roles = await listAdminRoles(session.user.id);
      return {
        authenticated: true,
        user: {
          ...session.user,
          adminRoles: roles.map((role) => role.role),
        },
        sessionId: session.session.id,
        source: 'cookie',
      };
    }
  }

  const developmentUserId = getExplicitDevelopmentUserId(
    listDevAuthBypassCookieNames(host).some((name) => cookieStore.get(name)?.value === 'true'),
  );
  if (developmentUserId) {
    const user = await getUserById(developmentUserId);
    if (!user) {
      throw new AccountDomainError('account_not_found', 'Development user not found.', 404);
    }

    const roles = await listAdminRoles(user.id);
    return {
      authenticated: true,
      user: {
        ...user,
        adminRoles: roles.map((role) => role.role),
      },
      sessionId: null,
      source: 'development',
    };
  }

  return {
    authenticated: false,
    user: null,
    sessionId: null,
    source: 'none',
  };
}
