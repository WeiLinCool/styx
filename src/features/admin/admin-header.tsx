'use client';

import { Database, Loader2, LockKeyhole, LogOut, UserRoundCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { adminApiRequest } from '@/lib/admin-api-client';
import { StatusBadge } from './status-badge';
import { formatAdminRole, formatAdminSource, adminText } from './admin-i18n';
import type { SessionContext } from '@/server/auth/account-types';

type AdminHeaderProps = {
  session: SessionContext;
  dataSource?: 'database' | 'seed';
};

export function AdminHeader({ session, dataSource = 'database' }: AdminHeaderProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const roleLabel = session.authenticated ? session.user.adminRoles.map(formatAdminRole).join('、') : '无角色';

  async function handleLogout() {
    setPending(true);
    try {
      await adminApiRequest('/api/admin/logout', { method: 'POST' });
      toast.success('已退出管理端登录。');
    } finally {
      router.push('/admin/login');
      router.refresh();
      setPending(false);
    }
  }

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          后台控制台
        </div>
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">运营仪表盘</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ThemeToggle className="h-8 w-8 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground" />
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-secondary/70 px-2.5">
          <UserRoundCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-40 truncate">{session.authenticated ? session.user.displayName : '未授权'}</span>
          <StatusBadge value={roleLabel || '无角色'} tone={session.authenticated ? 'success' : 'danger'} />
        </div>
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-secondary/70 px-2.5">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span>数据源</span>
          <StatusBadge value={formatAdminSource(dataSource)} tone={dataSource === 'database' ? 'success' : 'warning'} />
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
