import { AdminDocsModule } from '@/features/admin/admin-docs-module';
import { getAdminDocsModuleData } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocArticlesPage() {
  const data = await getAdminDocsModuleData();

  return <AdminDocsModule {...data} />;
}
