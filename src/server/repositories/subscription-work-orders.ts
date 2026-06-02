import { randomBytes } from 'node:crypto';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { AccountDomainError } from '@/server/auth/account-types';
import {
  type SubscriptionWorkOrderResult,
  type SubscriptionWorkOrderStatus,
} from '@/server/auth/subscription-work-orders';
import { db, schema } from '@/server/db';

export type SubscriptionWorkOrderLite = {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionWorkOrderStatus;
  createdAt: Date;
};

export type UserSubscriptionWorkOrderSummary = {
  id: string;
  code: string;
  status: SubscriptionWorkOrderStatus;
  result: SubscriptionWorkOrderResult | null;
  planName: string;
  planCode: string;
  orderNumber: string;
  orderStatus: string;
  orderTotalCents: number;
  submittedAmountCents: number;
  submittedPaymentMethod: string;
  submittedPaidAt: string;
  submittedReference: string;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export function chooseActiveSubscriptionWorkOrder<T extends SubscriptionWorkOrderLite>(
  rows: T[],
  userId: string,
  planId: string,
) {
  return (
    rows
      .filter((row) => row.userId === userId && row.planId === planId)
      .filter((row) => row.status === 'pending' || row.status === 'processing')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

export function shouldTreatApprovalAsIdempotent(input: {
  status: SubscriptionWorkOrderStatus;
  result: SubscriptionWorkOrderResult | null;
}) {
  return input.status === 'closed' && input.result === 'approved';
}

function datePart(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function formatSubscriptionWorkOrderCode(now: Date, entropy = randomBytes(6).toString('hex')) {
  return `MSWO-${datePart(now)}-${entropy.slice(0, 8).toUpperCase()}`;
}

export function buildSubscriptionOrderNumber(now: Date, entropy = randomBytes(6).toString('hex')) {
  return `MS-${datePart(now)}-${entropy.slice(0, 8).toUpperCase()}`;
}

export function requireSubscriptionDb() {
  if (!db) {
    throw new AccountDomainError('database_unavailable', 'Database connection is unavailable.', 503);
  }

  return db;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function getMembershipPlanByCode(planCode: string) {
  const database = requireSubscriptionDb();
  const [plan] = await database
    .select()
    .from(schema.membershipPlans)
    .where(eq(schema.membershipPlans.code, planCode))
    .limit(1);

  return plan ?? null;
}

export async function getActiveSubscriptionWorkOrder(input: {
  userId: string;
  planId: string;
}) {
  const database = requireSubscriptionDb();
  const [row] = await database
    .select()
    .from(schema.subscriptionWorkOrders)
    .where(
      and(
        eq(schema.subscriptionWorkOrders.userId, input.userId),
        eq(schema.subscriptionWorkOrders.planId, input.planId),
        inArray(schema.subscriptionWorkOrders.status, ['pending', 'processing']),
      ),
    )
    .orderBy(desc(schema.subscriptionWorkOrders.createdAt))
    .limit(1);

  return row ?? null;
}

export async function getCurrentSubscriptionWorkOrderSummary(
  userId: string,
): Promise<UserSubscriptionWorkOrderSummary | null> {
  const database = requireSubscriptionDb();
  const [row] = await database
    .select({
      workOrder: schema.subscriptionWorkOrders,
      order: schema.orders,
      plan: schema.membershipPlans,
    })
    .from(schema.subscriptionWorkOrders)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.subscriptionWorkOrders.orderId))
    .innerJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.subscriptionWorkOrders.planId))
    .where(eq(schema.subscriptionWorkOrders.userId, userId))
    .orderBy(desc(schema.subscriptionWorkOrders.createdAt))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.workOrder.id,
    code: row.workOrder.code,
    status: row.workOrder.status,
    result: row.workOrder.result,
    planName: row.plan.name,
    planCode: row.plan.code,
    orderNumber: row.order.orderNumber,
    orderStatus: row.order.status,
    orderTotalCents: row.order.totalCents,
    submittedAmountCents: row.workOrder.submittedAmountCents,
    submittedPaymentMethod: row.workOrder.submittedPaymentMethod,
    submittedPaidAt: toIso(row.workOrder.submittedPaidAt),
    submittedReference: row.workOrder.submittedReference,
    decisionNote: row.workOrder.decisionNote,
    createdAt: toIso(row.workOrder.createdAt),
    updatedAt: toIso(row.workOrder.updatedAt),
  };
}
