import type { ReactNode } from 'react';

import { AdminHeader } from './admin-header';
import { AdminNav } from './admin-nav';
import type { SessionContext } from '@/server/auth/account-types';

type AdminShellProps = {
  children: ReactNode;
  session: SessionContext;
  dataSource?: 'database' | 'seed';
};

export function AdminShell({ children, session, dataSource = 'database' }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-sidebar-border bg-sidebar px-4 py-4 text-sidebar-foreground lg:border-r lg:border-b-0">
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-xs font-black text-sidebar-primary-foreground">
              NF
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">南风 AI Admin</p>
              <p className="truncate text-xs text-muted-foreground">运营控制台</p>
            </div>
          </div>
          <AdminNav />
        </aside>

        <div className="min-w-0">
          <AdminHeader session={session} dataSource={dataSource} />
          <main className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
