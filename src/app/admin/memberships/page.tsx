import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminMemberships,
  type AdminMembershipRow,
} from '@/server/repositories/memberships';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminMembershipRow>[] = [
  {
    key: 'plan',
    label: '方案',
    render: (plan) => (
      <div>
        <div className="font-medium text-neutral-950">{plan.name}</div>
        <div className="text-xs text-neutral-500">{plan.code}</div>
      </div>
    ),
  },
  {
    key: 'pricing',
    label: '定价',
    render: (plan) => (
      <div>
        <div className="font-medium text-neutral-950">{plan.price}</div>
        <div className="text-xs text-neutral-500">{plan.billingPeriod}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (plan) => <StatusBadge value={plan.status} />,
  },
  {
    key: 'rules',
    label: '权益与授权',
    render: (plan) => (
      <div>
        <div className="text-xs text-neutral-700">{plan.benefitCount} 条权益规则</div>
        <div className="mt-1 text-xs text-neutral-500">{plan.entitlementCount} 条授权</div>
      </div>
    ),
  },
  {
    key: 'description',
    label: '说明',
    render: (plan) => <div className="max-w-sm text-xs text-neutral-600">{plan.description}</div>,
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (plan) => <AdminActionBar actions={plan.actions} />,
  },
];

export default async function AdminMembershipsPage() {
  const data = await getAdminMemberships();

  return (
    <AdminModulePage
      title="会员管理"
      description="会员方案定义、价格周期、权益数量与授权用户概览。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="搜索方案、代码或价格..."
    />
  );
}
