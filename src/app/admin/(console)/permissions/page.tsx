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

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-950">权限资源总览</h2>
        <p className="mt-1 text-sm text-neutral-600">
          这里用于查看平台已注册的菜单、页面、按钮和接口资源，以及会员方案当前绑定结果。
          会员方案的正式编辑入口已迁移到“会员管理”工作台。
        </p>
      </section>
      <AdminPermissionsModule mode="standalone" data={{ overview, workspace }} />
    </div>
  );
}
