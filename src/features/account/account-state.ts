import type { AccountState } from '@/server/auth/account-types';

const accountStateLabels: Record<AccountState, string> = {
  pending_activation: '待激活',
  active: '已激活',
  suspended: '已停用',
  archived: '已归档',
};

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

export function formatAccountStateLabel(value: string | null | undefined): string {
  return value && value in accountStateLabels
    ? accountStateLabels[value as AccountState]
    : '未知状态';
}
