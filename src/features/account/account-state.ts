import type { AccountState } from '@/server/auth/account-types';

type AccountLike = {
  accountState?: AccountState | null;
} | null | undefined;

export function getAccountState(account: AccountLike): AccountState {
  return account?.accountState ?? 'pending_activation';
}

export function isActiveAccount(account: AccountLike): boolean {
  return getAccountState(account) === 'active';
}

export function requiresActivation(account: AccountLike): boolean {
  return !isActiveAccount(account);
}
