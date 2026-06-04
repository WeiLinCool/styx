import {
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminOrderActions } from '@/features/admin/admin-action-controls';
import { AdminModuleGuide } from '@/features/admin/admin-module-guide';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminOrders,
  type AdminOrderRow,
} from '@/server/repositories/orders';

export const dynamic = 'force-dynamic';

export const adminOrdersGuide = (
  <AdminModuleGuide
    title="订单处理新手导航"
    description="订单页负责支付和履约状态维护。先核对订单信息，再按状态推进，避免把会员、积分或实体履约提前切到完成态。"
    steps={[
      '先核对订单号、用户、商品和金额，确认当前订单对应的业务对象。',
      '待处理订单先标记为已支付；已支付订单再标记履约；已履约订单仅补备注，不再重复推进状态。',
      '如果订单关联会员开通或人工核销，再回到对应工单页完成审批闭环。',
    ]}
    risks={[
      '不要跳过“已支付”直接履约，否则容易让后续人工核销或权益开通失去依据。',
      '取消订单前先确认是否已产生会员权益、积分发放或外部履约动作，避免状态和实际交付不一致。',
    ]}
  />
);

function getOrderStatusPresentation(order: AdminOrderRow) {
  if (order.isMembershipSubscription) {
    if (order.status === 'pending') {
      return { value: order.status, label: '待付款确认' };
    }

    if (order.status === 'paid') {
      return { value: order.status, label: '待会员审批' };
    }

    if (order.status === 'fulfilled') {
      return { value: order.status, label: '会员已开通' };
    }
  }

  return { value: order.status };
}

const columns: AdminColumn<AdminOrderRow>[] = [
  {
    key: 'order',
    label: '订单',
    render: (order) => (
      <div>
        <div className="font-medium text-foreground">{order.orderNumber}</div>
        <div className="text-xs text-muted-foreground">{order.createdAt}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (order) => {
      const presentation = getOrderStatusPresentation(order);
      return <StatusBadge value={presentation.value} label={presentation.label} />;
    },
  },
  {
    key: 'user',
    label: '用户',
    render: (order) => <span className="text-sm text-foreground">{order.user}</span>,
  },
  {
    key: 'item',
    label: '商品 / SKU',
    render: (order) => (
      <div>
        <div className="text-sm text-foreground">{order.item}</div>
        <div className="text-xs text-muted-foreground">{order.sku}</div>
      </div>
    ),
  },
  {
    key: 'fulfillment',
    label: '履约',
    render: (order) => (
      <div>
        <div className="font-medium text-foreground">{order.total}</div>
        <div className="mt-1 text-xs text-muted-foreground">{order.fulfillmentNote}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (order) => (
      <AdminOrderActions
        orderId={order.id}
        status={order.status}
        isMembershipSubscription={order.isMembershipSubscription}
      />
    ),
  },
];

export default async function AdminOrdersPage() {
  const data = await getAdminOrders();

  return (
    <AdminModulePage
      title="订单管理"
      description="订单状态、用户、商品 SKU、金额、支付与履约备注。"
      guide={adminOrdersGuide}
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="搜索订单号、用户或 SKU..."
    />
  );
}
