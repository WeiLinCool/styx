import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
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
  status: string;
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
      user: '待激活创作者',
      item: 'Pro Monthly',
      sku: 'pro-monthly',
      total: '¥99',
      fulfillmentNote: '等待支付与账号激活',
      paidAt: '未记录',
      createdAt: '2026-05-29T05:30:00.000Z',
      actions: ['Mark paid', 'Cancel', 'Add note'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '订单数', value: '2', hint: 'seed orders', tone: 'info' },
      { label: '已支付', value: '1', hint: 'ready to fulfill', tone: 'success' },
      { label: '待处理', value: '1', hint: 'payment pending', tone: 'warning' },
      { label: '订单额', value: '¥128', hint: 'sample total', tone: 'default' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 2 },
      { label: 'Pending', value: 'pending', count: 1 },
      { label: 'Paid', value: 'paid', count: 1 },
      { label: 'Fulfilled', value: 'fulfilled' },
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

  const records = rows.map(({ order, user, product, plan }) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    user: user?.displayName ?? '未知用户',
    item: product?.name ?? plan?.name ?? 'Custom order',
    sku: product?.sku ?? plan?.code ?? 'manual',
    total: formatCurrency(order.totalCents, order.currency),
    fulfillmentNote: metadataText(order.metadata, 'fulfillmentNote', '等待运营处理'),
    paidAt: formatIso(order.paidAt),
    createdAt: formatIso(order.createdAt),
    actions: ['Update status', 'Refund', 'Add note'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '订单数', value: String(records.length), hint: 'PostgreSQL', tone: 'info' },
      {
        label: '已支付',
        value: String(records.filter((record) => record.status === 'paid').length),
        hint: 'paid',
        tone: 'success',
      },
      {
        label: '待处理',
        value: String(records.filter((record) => record.status === 'pending').length),
        hint: 'pending',
        tone: 'warning',
      },
      {
        label: '已履约',
        value: String(records.filter((record) => record.status === 'fulfilled').length),
        hint: 'fulfilled',
        tone: 'default',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Pending', value: 'pending' },
      { label: 'Paid', value: 'paid' },
      { label: 'Fulfilled', value: 'fulfilled' },
      { label: 'Refunded', value: 'refunded' },
    ],
    records,
  };
}
