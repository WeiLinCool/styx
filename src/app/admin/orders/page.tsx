import {
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminOrderActions } from '@/features/admin/admin-action-controls';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminOrders,
  type AdminOrderRow,
} from '@/server/repositories/orders';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminOrderRow>[] = [
  {
    key: 'order',
    label: '订单',
    render: (order) => (
      <div>
        <div className="font-medium text-neutral-950">{order.orderNumber}</div>
        <div className="text-xs text-neutral-500">{order.createdAt}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (order) => <StatusBadge value={order.status} />,
  },
  {
    key: 'user',
    label: '用户',
    render: (order) => <span className="text-sm text-neutral-800">{order.user}</span>,
  },
  {
    key: 'item',
    label: '商品 / SKU',
    render: (order) => (
      <div>
        <div className="text-sm text-neutral-900">{order.item}</div>
        <div className="text-xs text-neutral-500">{order.sku}</div>
      </div>
    ),
  },
  {
    key: 'fulfillment',
    label: '履约',
    render: (order) => (
      <div>
        <div className="font-medium text-neutral-950">{order.total}</div>
        <div className="mt-1 text-xs text-neutral-500">{order.fulfillmentNote}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (order) => <AdminOrderActions orderId={order.id} />,
  },
];

export default async function AdminOrdersPage() {
  const data = await getAdminOrders();

  return (
    <AdminModulePage
      title="Orders"
      description="订单状态、用户、商品 SKU、金额、支付与履约备注。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="Search order number, user, SKU..."
    />
  );
}
