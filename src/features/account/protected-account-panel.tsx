'use client';

import type { AccountState } from '@/server/auth/account-types';
import { ActivationPanel } from './activation-panel';

type ProtectedAccountPanelProps = {
  accountState?: AccountState;
  title?: string;
};

export function ProtectedAccountPanel({ accountState, title = '需要激活账号' }: ProtectedAccountPanelProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#1d1d1f]">{title}</h1>
        <p className="mt-1 text-sm text-[#555555]">完成激活或绑定后即可继续使用当前功能。</p>
      </div>
      <ActivationPanel accountState={accountState} />
    </div>
  );
}
