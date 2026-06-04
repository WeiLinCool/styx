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
  relationSummary: string;
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
      relationSummary: '工单待核销，订单待支付，会员权益未开通',
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
      { label: '订阅工单', value: '1', hint: '示例数据', tone: 'info' },
      { label: '待处理', value: '1', hint: '待核销', tone: 'warning' },
      { label: '处理中', value: '0', hint: '人工核验中', tone: 'default' },
      { label: '已办结', value: '0', hint: '已完成审批', tone: 'default' },
    ],
    filters: [
      { label: '全部', value: 'all', count: 1 },
      { label: '待处理', value: 'pending', count: 1 },
      { label: '处理中', value: 'processing', count: 0 },
      { label: '已办结', value: 'closed', count: 0 },
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
    const relationSummary =
      workOrder.result === 'approved'
        ? '审批已通过，会员权益已开通或顺延'
        : workOrder.result === 'rejected'
          ? '审批已拒绝，订单已取消'
          : workOrder.status === 'processing'
            ? '工单处理中，等待运营完成核销并开通会员'
            : order.status === 'fulfilled'
              ? '订单已履约，待同步完成会员开通'
              : order.status === 'paid'
                ? '订单已支付，待核销通过后开通会员'
                : '工单待核销，订单待支付，会员权益未开通';

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
      relationSummary,
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
        hint: '待核销',
        tone: 'warning',
      },
      {
        label: '处理中',
        value: String(countByStatus.processing ?? 0),
        hint: '人工核验中',
        tone: 'default',
      },
      {
        label: '已办结',
        value: String((countByStatus.closed ?? 0) + (countByStatus.archived ?? 0)),
        hint: '已完成审批',
        tone: 'success',
      },
    ],
    filters: [
      { label: '全部', value: 'all', count: records.length },
      { label: '待处理', value: 'pending', count: countByStatus.pending ?? 0 },
      { label: '处理中', value: 'processing', count: countByStatus.processing ?? 0 },
      { label: '已办结', value: 'closed', count: countByStatus.closed ?? 0 },
      { label: '已归档', value: 'archived', count: countByStatus.archived ?? 0 },
    ],
    records,
  };
}
