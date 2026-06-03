import { AdminPermissionsModule } from '@/features/admin/admin-permissions-module';
import { listMembershipPlanPermissionWorkspace } from '@/server/repositories/membership-plan-permissions';
import {
  getAdminPermissionResourceOverview,
  syncPermissionResourcesFromCatalog,
} from '@/server/repositories/permission-resources';

export const dynamic = 'force-dynamic';

export default async function AdminPermissionsPage() {
  await syncPermissionResourcesFromCatalog();

  const [overview, workspace] = await Promise.all([
    getAdminPermissionResourceOverview(),
    listMembershipPlanPermissionWorkspace('pro-monthly'),
  ]);

  return <AdminPermissionsModule data={{ overview, workspace }} />;
}
