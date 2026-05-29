import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminBenefits,
  type AdminBenefitRow,
} from '@/server/repositories/benefits';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminBenefitRow>[] = [
  {
    key: 'benefit',
    label: '权益',
    render: (benefit) => (
      <div>
        <div className="font-medium text-neutral-950">{benefit.name}</div>
        <div className="text-xs text-neutral-500">{benefit.code}</div>
      </div>
    ),
  },
  {
    key: 'kind',
    label: '类型',
    render: (benefit) => <StatusBadge value={benefit.kind} />,
  },
  {
    key: 'plan',
    label: '方案',
    render: (benefit) => <span className="text-sm text-neutral-800">{benefit.plan}</span>,
  },
  {
    key: 'quantity',
    label: '额度',
    render: (benefit) => (
      <div>
        <div className="font-medium text-neutral-950">{benefit.quantity}</div>
        <div className="text-xs text-neutral-500">{benefit.unit}</div>
      </div>
    ),
  },
  {
    key: 'rule',
    label: '规则 / 授权',
    render: (benefit) => (
      <div>
        <div className="text-xs text-neutral-700">{benefit.ruleSummary}</div>
        <div className="mt-1 text-xs text-neutral-500">{benefit.entitlementSummary}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (benefit) => <AdminActionBar actions={benefit.actions} />,
  },
];

export default async function AdminBenefitsPage() {
  const data = await getAdminBenefits();

  return (
    <AdminModulePage
      title="权益管理"
      description="权益规则、额度单位、适用会员方案与手动调整入口。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="搜索权益、代码或方案..."
    />
  );
}
