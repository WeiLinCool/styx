import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { AdminShell } from '@/features/admin/admin-shell';
import { resolveAdminSession } from '@/server/auth/admin-auth';

type AdminLayoutProps = {
  children: ReactNode;
};

export const dynamic = 'force-dynamic';

export default async function AdminConsoleLayout({ children }: AdminLayoutProps) {
  const session = await resolveAdminSession();

  if (!session.authenticated) {
    redirect('/admin/login');
  }

  if (!session.user.adminRoles.some((role) => ['owner', 'admin', 'operator'].includes(role))) {
    redirect('/admin/login');
  }

  return <AdminShell session={session}>{children}</AdminShell>;
}
