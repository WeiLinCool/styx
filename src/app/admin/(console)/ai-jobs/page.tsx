import { AdminAiJobsModule } from '@/features/admin/admin-ai-jobs-module';
import { getAdminAiJobs } from '@/server/repositories/ai-jobs';

export const dynamic = 'force-dynamic';

export default async function AdminAiJobsPage() {
  const data = await getAdminAiJobs();

  return (
    <AdminAiJobsModule
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
    />
  );
}
