import { AdminUsersModule } from '@/features/admin/admin-users-module';
import { AdminWorkOrderQueue } from '@/features/admin/admin-work-order-queue';
import {
  getAdminActivationWorkOrders,
  type AdminWorkOrderQueueStatus,
} from '@/server/repositories/admin-activation-work-orders';
import { getAdminUsers } from '@/server/repositories/users';

export const dynamic = 'force-dynamic';

function resolveQueueStatus(value: string | undefined): AdminWorkOrderQueueStatus {
  return value === 'processing' || value === 'closed' || value === 'archived'
    ? value
    : 'pending';
}

function resolvePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getAdminUsers();
  const params = searchParams ? await searchParams : {};
  const status = resolveQueueStatus(
    typeof params.status === 'string' ? params.status : undefined,
  );
  const page = resolvePage(typeof params.page === 'string' ? params.page : undefined);
  const workOrders = await getAdminActivationWorkOrders({
    status,
    page,
    pageSize: 10,
  });

  return (
    <div className="space-y-4">
      <AdminWorkOrderQueue queue={workOrders} />

      <AdminUsersModule
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
      />
    </div>
  );
}
