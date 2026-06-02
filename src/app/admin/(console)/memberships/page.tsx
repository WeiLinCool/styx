import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminSubscriptionWorkOrderActions } from '@/features/admin/admin-action-controls';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminSubscriptionWorkOrders,
  type AdminSubscriptionWorkOrderRow,
} from '@/server/repositories/admin-subscription-work-orders';
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

const subscriptionWorkOrderColumns: AdminColumn<AdminSubscriptionWorkOrderRow>[] = [
  {
    key: 'workOrder',
    label: '工单 / 订单',
    render: (record) => (
      <div>
        <div className="font-medium text-neutral-950">{record.code}</div>
        <div className="text-xs text-neutral-500">{record.orderNumber}</div>
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
        <div className="text-sm text-neutral-900">{record.user}</div>
        <div className="text-xs text-neutral-500">{record.plan}</div>
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
            record.amountMismatch ? 'font-medium text-red-700' : 'font-medium text-neutral-950'
          }
        >
          {record.submittedAmount} / 应收 {record.orderTotal}
        </div>
        <div className="text-xs text-neutral-500">
          {record.paymentMethod} · {record.reference}
        </div>
        <div className="mt-1 text-xs text-neutral-500">{record.submittedPaidAt}</div>
      </div>
    ),
  },
  {
    key: 'note',
    label: '备注',
    render: (record) => (
      <div className="max-w-xs text-xs text-neutral-600">
        {record.note}
        {record.decisionNote !== '未填写' ? (
          <div className="mt-1 text-neutral-500">{record.decisionNote}</div>
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
  const [plans, subscriptionWorkOrders] = await Promise.all([
    getAdminMemberships(),
    getAdminSubscriptionWorkOrders(),
  ]);

  return (
    <div className="space-y-6">
      <AdminModulePage
        title="会员管理"
        description="会员方案定义、价格周期、权益数量与授权用户概览。"
        source={plans.source}
        metrics={plans.metrics}
        filters={plans.filters}
        records={plans.records}
        columns={columns}
        searchPlaceholder="搜索方案、代码或价格..."
      />
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
