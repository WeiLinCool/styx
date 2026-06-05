import { AdminDocsModule } from '@/features/admin/admin-docs-module';
import { getAdminDocsModuleData } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

function normalizeStatus(value?: string) {
  return value === 'draft' || value === 'published' || value === 'archived' ? value : undefined;
}

export default async function AdminDocsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    categoryId?: string;
    search?: string;
  }>;
}) {
  const params = await searchParams;
  const data = await getAdminDocsModuleData({
    status: normalizeStatus(params.status),
    categoryId: params.categoryId,
    search: params.search,
  });

  return <AdminDocsModule {...data} />;
}
