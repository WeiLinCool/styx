import { AdminDocsModule } from '@/features/admin/admin-docs-module';
import { getAdminDocsModuleData } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocsPage() {
  const data = await getAdminDocsModuleData();

  return <AdminDocsModule {...data} />;
}
