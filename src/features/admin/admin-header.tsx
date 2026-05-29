'use client';

import { Database, Loader2, LockKeyhole, LogOut, UserRoundCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { StatusBadge } from './status-badge';
import type { SessionContext } from '@/server/auth/account-types';

type AdminHeaderProps = {
  session: SessionContext;
  dataSource?: 'database' | 'seed';
};

export function AdminHeader({ session, dataSource = 'database' }: AdminHeaderProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const roleLabel = session.authenticated ? session.user.adminRoles.join(', ') : '无角色';

  async function handleLogout() {
    setPending(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.push('/admin/login');
      router.refresh();
      setPending(false);
    }
  }

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <LockKeyhole className="h-3.5 w-3.5" />
          后台控制台
        </div>
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950">运营仪表盘</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
        <div className="flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5">
          <UserRoundCheck className="h-3.5 w-3.5 text-neutral-500" />
          <span className="max-w-40 truncate">{session.authenticated ? session.user.displayName : '未授权'}</span>
          <StatusBadge value={roleLabel || '无角色'} tone={session.authenticated ? 'success' : 'danger'} />
        </div>
        <div className="flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5">
          <Database className="h-3.5 w-3.5 text-neutral-500" />
          <span>数据源</span>
          <StatusBadge value={dataSource === 'database' ? '数据库' : '种子数据'} tone={dataSource === 'database' ? 'success' : 'warning'} />
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          onClick={() => void handleLogout()}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          退出登录
        </button>
      </div>
    </header>
  );
}
