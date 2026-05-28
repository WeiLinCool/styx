import {
  AdminActionBar,
  AdminModulePage,
  DetailList,
  type AdminColumn,
} from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
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
        <div className="text-xs text-neutral-500">{user.credits} credits</div>
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
    render: (user) => <AdminActionBar actions={user.actions} />,
  },
];

export default async function AdminUsersPage() {
  const data = await getAdminUsers();

  return (
    <AdminModulePage
      title="Users"
      description="账号生命周期、身份绑定、会员额度、活动与审计摘要。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="Search name, email, phone, identity..."
    />
  );
}
