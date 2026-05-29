import { AccountDomainError } from './account-types';
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
  const session = await requireActiveAccount();

  if (!session.user.adminRoles.some((role) => ['owner', 'admin', 'operator'].includes(role))) {
    throw new AccountDomainError('admin_required', 'Admin access is required.', 403);
  }

  return session;
}
