import { AccountDomainError } from './account-types';
import { requireUserPermission } from './permission-service';
import { resolveAdminSession } from './admin-auth';
import { resolveSession } from './session';

export async function requireActiveAccount() {
  const session = await resolveSession();

  if (!session.authenticated) {
    throw new AccountDomainError('session_required', 'Sign in is required.', 401);
  }

  if (session.user.accountState !== 'active') {
    throw new AccountDomainError(
      'account_not_active',
      'Account activation is required.',
      403,
    );
  }

  return session;
}

export async function requireAdmin() {
  const session = await resolveAdminSession();

  if (!session.authenticated) {
    throw new AccountDomainError('session_required', 'Admin sign in is required.', 401);
  }

  if (!session.user.adminRoles.some((role) => ['owner', 'admin', 'operator'].includes(role))) {
    throw new AccountDomainError('admin_required', 'Admin access is required.', 403);
  }

  return session;
}

export async function requireAuthenticatedUserPermission(code: string) {
  const session = await requireActiveAccount();
  await requireUserPermission(session, code);
  return session;
}
