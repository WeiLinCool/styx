import { Database, LockKeyhole, UserRoundCheck } from 'lucide-react';

import { StatusBadge } from './status-badge';
import type { SessionContext } from '@/server/auth/account-types';

type AdminHeaderProps = {
  session: SessionContext;
  dataSource?: 'database' | 'seed';
};

export function AdminHeader({ session, dataSource = 'database' }: AdminHeaderProps) {
  const roleLabel = session.authenticated ? session.user.adminRoles.join(', ') : 'none';

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <LockKeyhole className="h-3.5 w-3.5" />
          Admin Console
        </div>
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950">运营仪表盘</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
        <div className="flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5">
          <UserRoundCheck className="h-3.5 w-3.5 text-neutral-500" />
          <span className="max-w-40 truncate">{session.authenticated ? session.user.displayName : 'Unauthorized'}</span>
          <StatusBadge value={roleLabel || 'none'} tone={session.authenticated ? 'success' : 'danger'} />
        </div>
        <div className="flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5">
          <Database className="h-3.5 w-3.5 text-neutral-500" />
          <span>Data</span>
          <StatusBadge value={dataSource} tone={dataSource === 'database' ? 'success' : 'warning'} />
        </div>
      </div>
    </header>
  );
}
