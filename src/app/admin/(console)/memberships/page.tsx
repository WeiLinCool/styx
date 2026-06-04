import {
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminSubscriptionWorkOrderActions } from '@/features/admin/admin-action-controls';
import { AdminMembershipConfigModule } from '@/features/admin/admin-membership-config-module';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminSubscriptionWorkOrders,
  type AdminSubscriptionWorkOrderRow,
} from '@/server/repositories/admin-subscription-work-orders';
import {
  getAdminMembershipWorkspacePageData,
} from '@/server/repositories/membership-plan-versions';

export const dynamic = 'force-dynamic';

const subscriptionWorkOrderColumns: AdminColumn<AdminSubscriptionWorkOrderRow>[] = [
  {
    key: 'workOrder',
    label: '工单 / 订单',
    render: (record) => (
      <div>
        <div className="font-medium text-foreground">{record.code}</div>
        <div className="text-xs text-muted-foreground">{record.orderNumber}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (record) => <StatusBadge value={record.result ?? record.queueStatus} />,
  },
  {
    key: 'userPlan',
    label: '用户 / 方案',
    render: (record) => (
      <div>
        <div className="text-sm text-foreground">{record.user}</div>
        <div className="text-xs text-muted-foreground">{record.plan}</div>
      </div>
    ),
  },
  {
    key: 'payment',
    label: '付款信息',
    render: (record) => (
      <div>
        <div
          className={
            record.amountMismatch ? 'font-medium text-red-700' : 'font-medium text-foreground'
          }
        >
          {record.submittedAmount} / 应收 {record.orderTotal}
        </div>
        <div className="text-xs text-muted-foreground">
          {record.paymentMethod} · {record.reference}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{record.submittedPaidAt}</div>
      </div>
    ),
  },
  {
    key: 'note',
    label: '备注',
    render: (record) => (
      <div className="max-w-xs text-xs text-muted-foreground">
        {record.note}
        {record.decisionNote !== '未填写' ? (
          <div className="mt-1 text-muted-foreground">{record.decisionNote}</div>
        ) : null}
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (record) => (
      <AdminSubscriptionWorkOrderActions
        workOrderId={record.id}
        queueStatus={record.queueStatus}
      />
    ),
  },
];

export default async function AdminMembershipsPage() {
  const [workspaceData, subscriptionWorkOrders] = await Promise.all([
    getAdminMembershipWorkspacePageData(),
    getAdminSubscriptionWorkOrders(),
  ]);

  return (
    <div className="space-y-6">
      <AdminMembershipConfigModule data={workspaceData} />
      <AdminModulePage
        title="会员订阅工单"
        description="用户提交的会员付款核销队列，审批通过后开通或顺延会员权益。"
        source={subscriptionWorkOrders.source}
        metrics={subscriptionWorkOrders.metrics}
        filters={subscriptionWorkOrders.filters}
        records={subscriptionWorkOrders.records}
        columns={subscriptionWorkOrderColumns}
        searchPlaceholder="搜索工单号、订单号、用户或流水号..."
        emptyLabel="暂无会员订阅工单"
      />
    </div>
  );
}
