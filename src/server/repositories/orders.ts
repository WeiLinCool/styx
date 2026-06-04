import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
import type { OrderStatus } from '@/server/repositories/admin-mutations';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatCurrency,
  formatIso,
  metadataText,
} from './admin-shared';

export type AdminOrderRow = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: string;
  isMembershipSubscription: boolean;
  user: string;
  item: string;
  sku: string;
  total: string;
  fulfillmentNote: string;
  paidAt: string;
  createdAt: string;
  actions: string[];
};

function getSeedOrders(): AdminModuleData<AdminOrderRow> {
  const records: AdminOrderRow[] = [
    {
      id: 'seed-order-1',
      orderNumber: 'SEED-ORDER-0001',
      status: 'paid',
      source: 'credit_pack',
      isMembershipSubscription: false,
      user: 'Seed Member',
      item: '100 Credit Pack',
      sku: 'credit-pack-100',
      total: '¥29',
      fulfillmentNote: '待发放 100 credits',
      paidAt: '2026-05-29T06:50:00.000Z',
      createdAt: '2026-05-29T06:48:00.000Z',
      actions: ['Mark fulfilled', 'Refund', 'Add note'],
    },
    {
      id: 'seed-order-2',
      orderNumber: 'SEED-ORDER-0002',
      status: 'pending',
      source: 'membership_subscription_work_order',
      isMembershipSubscription: true,
      user: '待激活创作者',
      item: 'Pro Monthly',
      sku: 'pro-monthly',
      total: '¥99',
      fulfillmentNote: '支付完成后等待会员工单审批，审批通过后自动履约',
      paidAt: '未记录',
      createdAt: '2026-05-29T05:30:00.000Z',
      actions: ['Mark paid', 'Cancel', 'Add note'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '订单数', value: '2', hint: '示例数据', tone: 'info' },
      { label: '已支付', value: '1', hint: '待履约', tone: 'success' },
      { label: '待处理', value: '1', hint: '等待支付', tone: 'warning' },
      { label: '订单额', value: '¥128', hint: '示例总额', tone: 'default' },
    ],
    filters: [
      { label: '全部', value: 'all', count: 2 },
      { label: '待处理', value: 'pending', count: 1 },
      { label: '已支付', value: 'paid', count: 1 },
      { label: '已履约', value: 'fulfilled' },
    ],
    records,
  };
}

export async function getAdminOrders(): Promise<AdminModuleData<AdminOrderRow>> {
  const database = ensureAdminReadSource('orders');

  if (!database) {
    return getSeedOrders();
  }

  const rows = await database
    .select({
      order: schema.orders,
      user: schema.users,
      product: schema.products,
      plan: schema.membershipPlans,
    })
    .from(schema.orders)
    .leftJoin(schema.users, eq(schema.users.id, schema.orders.userId))
    .leftJoin(schema.products, eq(schema.products.id, schema.orders.productId))
    .leftJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.orders.planId))
    .orderBy(desc(schema.orders.createdAt))
    .limit(100);

  const records = rows.map(({ order, user, product, plan }) => {
    const source = metadataText(order.metadata, 'source', 'manual');
    const isMembershipSubscription =
      source === 'membership_subscription_work_order' || Boolean(order.planId || plan?.id);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      source,
      isMembershipSubscription,
      user: user?.displayName ?? '未知用户',
      item: product?.name ?? plan?.name ?? 'Custom order',
      sku: product?.sku ?? plan?.code ?? 'manual',
      total: formatCurrency(order.totalCents, order.currency),
      fulfillmentNote: metadataText(
        order.metadata,
        'fulfillmentNote',
        isMembershipSubscription
          ? '支付完成后等待会员工单审批，审批通过后自动履约'
          : '等待运营处理',
      ),
      paidAt: formatIso(order.paidAt),
      createdAt: formatIso(order.createdAt),
      actions: ['Update status', 'Refund', 'Add note'],
    };
  });

  return {
    source: 'database',
    metrics: [
      { label: '订单数', value: String(records.length), hint: '数据库', tone: 'info' },
      {
        label: '已支付',
        value: String(records.filter((record) => record.status === 'paid').length),
        hint: '待履约',
        tone: 'success',
      },
      {
        label: '待处理',
        value: String(records.filter((record) => record.status === 'pending').length),
        hint: '等待支付',
        tone: 'warning',
      },
      {
        label: '已履约',
        value: String(records.filter((record) => record.status === 'fulfilled').length),
        hint: '已完成处理',
        tone: 'default',
      },
    ],
    filters: [
      { label: '全部', value: 'all', count: records.length },
      { label: '待处理', value: 'pending' },
      { label: '已支付', value: 'paid' },
      { label: '已履约', value: 'fulfilled' },
      { label: '已退款', value: 'refunded' },
    ],
    records,
  };
}
