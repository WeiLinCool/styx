import type { ReactNode } from 'react';

import { AdminAuthActions } from '@/features/admin/admin-auth-actions';
import { AdminShell } from '@/features/admin/admin-shell';
import { StatusBadge } from '@/features/admin/status-badge';
import { AccountDomainError, type SessionContext } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';

type AdminLayoutProps = {
  children: ReactNode;
};

export const dynamic = 'force-dynamic';

function getAccessErrorMessage(error: unknown) {
  if (error instanceof AccountDomainError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '后台访问不可用。';
}

function createDeniedSession(): SessionContext {
  return {
    authenticated: false,
    user: null,
    sessionId: null,
    source: 'none',
  };
}

function AdminAccessDenied({ reason }: { reason: string }) {
  return (
    <AdminShell session={createDeniedSession()} dataSource="seed">
      <section className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-neutral-950">后台访问被拒绝</h2>
          <StatusBadge value="开发环境" tone="warning" />
        </div>
        <p className="max-w-2xl text-sm leading-6 text-neutral-600">
          后台内容已阻断。开发环境需要配置可解析的管理员会话，或显式设置
          <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5">STYX_ENABLE_DEV_AUTH=true</code>
          与
          <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5">STYX_DEV_USER_ID</code>
          ，并确保数据库可读取该用户和管理员角色。
        </p>
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{reason}</p>
        <div className="mt-4 max-w-xl">
          <AdminAuthActions authenticated={false} />
        </div>
      </section>
    </AdminShell>
  );
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  let session: SessionContext;

  try {
    session = await requireAdmin();
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    return <AdminAccessDenied reason={getAccessErrorMessage(error)} />;
  }

  return <AdminShell session={session}>{children}</AdminShell>;
}
