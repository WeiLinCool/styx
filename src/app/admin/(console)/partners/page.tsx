import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminPartners,
  type AdminPartnerRow,
} from '@/server/repositories/partners';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminPartnerRow>[] = [
  {
    key: 'company',
    label: '公司',
    render: (lead) => (
      <div>
        <div className="font-medium text-foreground">{lead.companyName}</div>
        <div className="text-xs text-muted-foreground">{lead.contact}</div>
      </div>
    ),
  },
  {
    key: 'stage',
    label: '阶段',
    render: (lead) => <StatusBadge value={lead.status} />,
  },
  {
    key: 'source',
    label: '来源 / 负责人',
    render: (lead) => (
      <div>
        <div className="text-sm text-foreground">{lead.source}</div>
        <div className="text-xs text-muted-foreground">{lead.owner}</div>
      </div>
    ),
  },
  {
    key: 'interest',
    label: '权益兴趣',
    render: (lead) => <div className="max-w-xs text-xs text-muted-foreground">{lead.benefitInterest}</div>,
  },
  {
    key: 'next',
    label: '下一步',
    render: (lead) => (
      <div>
        <div className="text-xs font-medium text-foreground">{lead.nextAction}</div>
        <div className="mt-1 text-xs text-muted-foreground">{lead.notes}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (lead) => <AdminActionBar actions={lead.actions} />,
  },
];

export default async function AdminPartnersPage() {
  const data = await getAdminPartners();

  return (
    <AdminModulePage
      title="合作管理"
      description="合作线索阶段、来源、联系人、权益兴趣与下一步动作。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="搜索公司、联系人或来源..."
    />
  );
}
