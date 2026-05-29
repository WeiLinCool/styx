import {
  AdminModulePage,
  DetailList,
  type AdminColumn,
} from '@/features/admin/module-page';
import {
  AdminActivationWorkOrderActions,
  AdminUserActions,
} from '@/features/admin/admin-action-controls';
import { StatusBadge } from '@/features/admin/status-badge';
import { getAdminActivationWorkOrders } from '@/server/repositories/admin-activation-work-orders';
import {
  getAdminUsers,
  type AdminUserRow,
} from '@/server/repositories/users';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminUserRow>[] = [
  {
    key: 'user',
    label: '用户',
    render: (user) => (
      <div>
        <div className="font-medium text-neutral-950">{user.displayName}</div>
        <div className="text-xs text-neutral-500">{user.primaryContact}</div>
      </div>
    ),
  },
  {
    key: 'state',
    label: '生命周期',
    render: (user) => <StatusBadge value={user.accountState} />,
  },
  {
    key: 'binding',
    label: '身份绑定',
    render: (user) => (
      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-700">{user.bindingState}</div>
        <DetailList items={user.identities} />
      </div>
    ),
  },
  {
    key: 'membership',
    label: '会员 / 额度',
    render: (user) => (
      <div>
        <div className="text-sm text-neutral-900">{user.membership}</div>
        <div className="text-xs text-neutral-500">{user.credits} 点额度</div>
      </div>
    ),
  },
  {
    key: 'activity',
    label: '活动 / 审计',
    render: (user) => (
      <div>
        <div className="text-xs text-neutral-700">{user.activity}</div>
        <div className="mt-1 text-xs text-neutral-500">{user.auditSummary}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (user) => <AdminUserActions userId={user.id} />,
  },
];

export default async function AdminUsersPage() {
  const data = await getAdminUsers();
  const workOrders = await getAdminActivationWorkOrders();

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-950">激活绑定工单</h2>
            <p className="mt-1 text-sm text-neutral-600">
              用户从浏览器生成工单码后，客服在这里审核并完成账号激活绑定。
            </p>
          </div>
          <StatusBadge value={`${workOrders.length} 个工单`} tone={workOrders.length > 0 ? 'warning' : 'success'} />
        </div>
        <div className="grid gap-3">
          {workOrders.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500">
              暂无待处理激活绑定工单
            </div>
          ) : (
            workOrders.map((workOrder) => (
              <div
                key={workOrder.id}
                className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 lg:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-neutral-950">{workOrder.code}</span>
                    <StatusBadge value={workOrder.status} />
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">{workOrder.userLabel}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    设备摘要：{workOrder.deviceSummary} · 过期：{workOrder.expiresAt}
                  </p>
                </div>
                {workOrder.status === 'pending' ? (
                  <AdminActivationWorkOrderActions workOrderId={workOrder.id} />
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <AdminModulePage
        title="用户管理"
        description="账号生命周期、身份绑定、会员额度、活动与审计摘要。"
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
        columns={columns}
        searchPlaceholder="搜索姓名、邮箱、手机或身份信息..."
      />
    </div>
  );
}
