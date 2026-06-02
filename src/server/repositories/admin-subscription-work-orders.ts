import { desc, eq, sql } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatCurrency,
  formatIso,
} from './admin-shared';

export type AdminSubscriptionWorkOrderQueueStatus =
  | 'pending'
  | 'processing'
  | 'closed'
  | 'archived';

export type AdminSubscriptionWorkOrderRow = {
  id: string;
  code: string;
  queueStatus: AdminSubscriptionWorkOrderQueueStatus;
  result: 'approved' | 'rejected' | null;
  user: string;
  plan: string;
  orderNumber: string;
  orderStatus: string;
  orderTotal: string;
  submittedAmount: string;
  amountMismatch: boolean;
  paymentMethod: string;
  submittedPaidAt: string;
  reference: string;
  note: string;
  decisionNote: string;
  updatedAt: string;
};

function getSeedSubscriptionWorkOrders(): AdminModuleData<AdminSubscriptionWorkOrderRow> {
  const records: AdminSubscriptionWorkOrderRow[] = [
    {
      id: '00000000-0000-4000-8000-000000000091',
      code: 'MSWO-20260602-SEED0001',
      queueStatus: 'pending',
      result: null,
      user: 'Seed Member',
      plan: 'Pro Monthly',
      orderNumber: 'MS-20260602-SEED0001',
      orderStatus: 'pending',
      orderTotal: '¥99',
      submittedAmount: '¥99',
      amountMismatch: false,
      paymentMethod: '微信转账',
      submittedPaidAt: '2026-06-02T08:00:00.000Z',
      reference: 'WX-SEED-0001',
      note: '等待客服核销',
      decisionNote: '未填写',
      updatedAt: '2026-06-02T08:00:00.000Z',
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '订阅工单', value: '1', hint: 'seed', tone: 'info' },
      { label: '待处理', value: '1', hint: 'pending', tone: 'warning' },
      { label: '处理中', value: '0', hint: 'processing', tone: 'default' },
      { label: '已办结', value: '0', hint: 'closed', tone: 'default' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 1 },
      { label: 'Pending', value: 'pending', count: 1 },
      { label: 'Processing', value: 'processing', count: 0 },
      { label: 'Closed', value: 'closed', count: 0 },
    ],
    records,
  };
}

export async function getAdminSubscriptionWorkOrders(): Promise<
  AdminModuleData<AdminSubscriptionWorkOrderRow>
> {
  const database = ensureAdminReadSource('subscription work orders');

  if (!database) {
    return getSeedSubscriptionWorkOrders();
  }

  const rows = await database
    .select({
      workOrder: schema.subscriptionWorkOrders,
      order: schema.orders,
      plan: schema.membershipPlans,
      user: schema.users,
    })
    .from(schema.subscriptionWorkOrders)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.subscriptionWorkOrders.orderId))
    .innerJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.subscriptionWorkOrders.planId))
    .innerJoin(schema.users, eq(schema.users.id, schema.subscriptionWorkOrders.userId))
    .orderBy(desc(schema.subscriptionWorkOrders.createdAt))
    .limit(100);

  const counts = await database
    .select({
      status: schema.subscriptionWorkOrders.status,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.subscriptionWorkOrders)
    .groupBy(schema.subscriptionWorkOrders.status);

  const countByStatus = Object.fromEntries(counts.map((row) => [row.status, row.count]));
  const records = rows.map(({ workOrder, order, plan, user }) => {
    const amountMismatch = workOrder.submittedAmountCents !== order.totalCents;

    return {
      id: workOrder.id,
      code: workOrder.code,
      queueStatus: workOrder.status,
      result: workOrder.result,
      user: user.displayName,
      plan: plan.name,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      orderTotal: formatCurrency(order.totalCents, order.currency),
      submittedAmount: formatCurrency(workOrder.submittedAmountCents, order.currency),
      amountMismatch,
      paymentMethod: workOrder.submittedPaymentMethod,
      submittedPaidAt: formatIso(workOrder.submittedPaidAt),
      reference: workOrder.submittedReference,
      note: workOrder.submittedNote ?? '未填写',
      decisionNote: workOrder.decisionNote ?? '未填写',
      updatedAt: formatIso(workOrder.updatedAt),
    };
  });

  return {
    source: 'database',
    metrics: [
      { label: '订阅工单', value: String(records.length), hint: '数据库', tone: 'info' },
      {
        label: '待处理',
        value: String(countByStatus.pending ?? 0),
        hint: 'pending',
        tone: 'warning',
      },
      {
        label: '处理中',
        value: String(countByStatus.processing ?? 0),
        hint: 'processing',
        tone: 'default',
      },
      {
        label: '已办结',
        value: String((countByStatus.closed ?? 0) + (countByStatus.archived ?? 0)),
        hint: 'closed',
        tone: 'success',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Pending', value: 'pending', count: countByStatus.pending ?? 0 },
      { label: 'Processing', value: 'processing', count: countByStatus.processing ?? 0 },
      { label: 'Closed', value: 'closed', count: countByStatus.closed ?? 0 },
      { label: 'Archived', value: 'archived', count: countByStatus.archived ?? 0 },
    ],
    records,
  };
}
