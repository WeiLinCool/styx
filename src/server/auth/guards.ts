import { AccountDomainError } from './account-types';
import { requireUserPermission } from './permission-service';
import { resolveAdminSession } from './admin-auth';
import { resolveSession } from './session';

export async function requireActiveAccount() {
  const session = await resolveSession();

  if (!session.authenticated) {
    throw new AccountDomainError('session_required', '需要登录后才能继续。', 401);
  }

  if (session.user.accountState !== 'active') {
    throw new AccountDomainError(
      'account_not_active',
      '需要先激活账号。',
      403,
    );
  }

  return session;
}

export async function requireAdmin() {
  const session = await resolveAdminSession();

  if (!session.authenticated) {
    throw new AccountDomainError('session_required', '需要管理员登录后才能继续。', 401);
  }

  if (!session.user.adminRoles.some((role) => ['owner', 'admin', 'operator'].includes(role))) {
    throw new AccountDomainError('admin_required', '需要管理员权限。', 403);
  }

  return session;
}

export async function requireAuthenticatedUserPermission(code: string) {
  const session = await requireActiveAccount();
  await requireUserPermission(session, code);
  return session;
}
