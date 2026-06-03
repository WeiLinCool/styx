import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { recordAuditEvent } from '@/server/audit/audit-service';
import { db, schema } from '@/server/db';
import { qualifyReferralReward } from '@/server/repositories/admin-mutations';
import {
  membershipPlanVersionRepository,
  resolvePlanVersionForEntitlement,
} from '@/server/repositories/membership-plan-versions';
import {
  buildSubscriptionOrderNumber,
  formatSubscriptionWorkOrderCode,
  getCurrentSubscriptionWorkOrderSummary,
  getMembershipPlanByCode,
  requireSubscriptionDb,
  shouldTreatApprovalAsIdempotent,
} from '@/server/repositories/subscription-work-orders';
import { AccountDomainError } from './account-types';

export type SubscriptionWorkOrderStatus = 'pending' | 'processing' | 'closed' | 'archived';
export type SubscriptionWorkOrderResult = 'approved' | 'rejected';
export type MembershipBillingPeriod = 'month' | 'year' | 'one_time';

export function getSubscriptionApprovalOrderAction(status: string) {
  if (status === 'pending') {
    return { shouldMarkPaid: true };
  }

  if (status === 'paid') {
    return { shouldMarkPaid: false };
  }

  throw new AccountDomainError(
    'invalid_subscription_work_order_transition',
    `Linked subscription order cannot be approved from status ${status}.`,
    409,
  );
}

export function assertSubscriptionWorkOrderTransition(
  currentStatus: SubscriptionWorkOrderStatus,
  nextStatus: SubscriptionWorkOrderStatus,
) {
  const allowed: Record<SubscriptionWorkOrderStatus, SubscriptionWorkOrderStatus[]> = {
    pending: ['processing'],
    processing: ['closed'],
    closed: ['archived'],
    archived: [],
  };

  if (!allowed[currentStatus].includes(nextStatus)) {
    throw new AccountDomainError(
      'invalid_subscription_work_order_transition',
      `Invalid subscription work order transition: ${currentStatus} -> ${nextStatus}.`,
      409,
    );
  }
}

export function addMembershipPeriod(base: Date, billingPeriod: MembershipBillingPeriod) {
  const next = new Date(base);

  if (billingPeriod === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  if (billingPeriod === 'year') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }

  throw new AccountDomainError(
    'unsupported_membership_billing_period',
    `Unsupported membership billing period: ${billingPeriod}.`,
    400,
  );
}

export function getEntitlementWindow(input: {
  approvalTime: Date;
  billingPeriod: MembershipBillingPeriod;
  currentExpiresAt?: Date | null;
}) {
  const base =
    input.currentExpiresAt && input.currentExpiresAt.getTime() > input.approvalTime.getTime()
      ? input.currentExpiresAt
      : input.approvalTime;

  return {
    startsAt: input.approvalTime,
    expiresAt: addMembershipPeriod(base, input.billingPeriod),
  };
}

export function buildMembershipEntitlementRecord(input: {
  userId: string;
  planId: string;
  planVersionId: string;
  workOrderId: string;
  orderId: string;
  orderNumber: string;
  startsAt: Date;
  expiresAt: Date | null;
  approvalTime: Date;
}) {
  return {
    userId: input.userId,
    planId: input.planId,
    planVersionId: input.planVersionId,
    source: 'membership' as const,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    metadata: {
      source: 'subscription_work_order',
      workOrderId: input.workOrderId,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
    },
    updatedAt: input.approvalTime,
  };
}

function assertWritableDatabase(): NonNullable<typeof db> {
  return requireSubscriptionDb();
}

async function getWorkOrderForMutation(workOrderId: string) {
  const database = assertWritableDatabase();
  const [row] = await database
    .select({
      workOrder: schema.subscriptionWorkOrders,
      order: schema.orders,
      plan: schema.membershipPlans,
    })
    .from(schema.subscriptionWorkOrders)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.subscriptionWorkOrders.orderId))
    .innerJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.subscriptionWorkOrders.planId))
    .where(eq(schema.subscriptionWorkOrders.id, workOrderId))
    .limit(1);

  if (!row) {
    throw new AccountDomainError(
      'subscription_work_order_not_found',
      'Subscription work order not found.',
      404,
    );
  }

  return row;
}

async function getCurrentPlanExpiryWithExecutor(
  executor: Pick<NonNullable<typeof db>, 'select'>,
  input: {
    userId: string;
    planId: string;
  },
) {
  const [row] = await executor
    .select({ expiresAt: schema.userEntitlements.expiresAt })
    .from(schema.userEntitlements)
    .where(
      and(
        eq(schema.userEntitlements.userId, input.userId),
        eq(schema.userEntitlements.planId, input.planId),
        eq(schema.userEntitlements.source, 'membership'),
      ),
    )
    .orderBy(desc(schema.userEntitlements.expiresAt))
    .limit(1);

  return row?.expiresAt ?? null;
}

export async function createSubscriptionWorkOrder(input: {
  userId: string;
  planCode: string;
  submittedPaymentMethod: string;
  submittedAmountCents: number;
  submittedPaidAt: Date;
  submittedReference: string;
  submittedNote?: string | null;
}) {
  const database = assertWritableDatabase();
  const plan = await getMembershipPlanByCode(input.planCode);

  if (!plan) {
    throw new AccountDomainError('membership_plan_not_found', 'Membership plan not found.', 404);
  }

  if (!plan.isActive || plan.priceCents <= 0 || plan.billingPeriod === 'one_time') {
    throw new AccountDomainError(
      'membership_plan_unavailable',
      'Membership plan is not available for subscription.',
      400,
    );
  }

  const now = new Date();
  const entropy = crypto.randomUUID().replace(/-/g, '');
  const orderNumber = buildSubscriptionOrderNumber(now, entropy);
  const code = formatSubscriptionWorkOrderCode(now, entropy.slice(8));

  const created = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from ${schema.users} where id = ${input.userId} for update`);

    const [existing] = await tx
      .select()
      .from(schema.subscriptionWorkOrders)
      .where(
        and(
          eq(schema.subscriptionWorkOrders.userId, input.userId),
          eq(schema.subscriptionWorkOrders.planId, plan.id),
          inArray(schema.subscriptionWorkOrders.status, ['pending', 'processing']),
        ),
      )
      .orderBy(desc(schema.subscriptionWorkOrders.createdAt))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [order] = await tx
      .insert(schema.orders)
      .values({
        orderNumber,
        userId: input.userId,
        planId: plan.id,
        status: 'pending',
        subtotalCents: plan.priceCents,
        discountCents: 0,
        totalCents: plan.priceCents,
        currency: plan.currency,
        metadata: {
          source: 'membership_subscription_work_order',
          planCode: plan.code,
        },
        updatedAt: now,
      })
      .returning();

    if (!order) {
      throw new Error('Subscription order could not be persisted.');
    }

    await tx.insert(schema.orderEvents).values({
      orderId: order.id,
      type: 'created',
      actorUserId: input.userId,
      message: 'User submitted membership subscription work order.',
      metadata: {
        source: 'membership_subscription_work_order',
        planCode: plan.code,
      },
    });

    const [workOrder] = await tx
      .insert(schema.subscriptionWorkOrders)
      .values({
        code,
        userId: input.userId,
        orderId: order.id,
        planId: plan.id,
        submittedPaymentMethod: input.submittedPaymentMethod,
        submittedAmountCents: input.submittedAmountCents,
        submittedPaidAt: input.submittedPaidAt,
        submittedReference: input.submittedReference,
        submittedNote: input.submittedNote ?? null,
        metadata: {
          planCode: plan.code,
          orderNumber: order.orderNumber,
        },
        updatedAt: now,
      })
      .returning();

    if (!workOrder) {
      throw new Error('Subscription work order could not be persisted.');
    }

    return workOrder;
  });

  const summary = await getCurrentSubscriptionWorkOrderSummary(input.userId);
  if (summary?.id === created.id) {
    return summary;
  }

  return {
    id: created.id,
    code: created.code,
    status: created.status,
    result: created.result,
    planName: plan.name,
    planCode: plan.code,
    orderNumber,
    orderStatus: 'pending',
    orderTotalCents: plan.priceCents,
    submittedAmountCents: created.submittedAmountCents,
    submittedPaymentMethod: created.submittedPaymentMethod,
    submittedPaidAt: created.submittedPaidAt.toISOString(),
    submittedReference: created.submittedReference,
    decisionNote: created.decisionNote,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export async function startSubscriptionWorkOrderProcessing(input: {
  workOrderId: string;
  actorId: string;
}) {
  const database = assertWritableDatabase();
  const { workOrder } = await getWorkOrderForMutation(input.workOrderId);
  assertSubscriptionWorkOrderTransition(workOrder.status, 'processing');

  const now = new Date();
  const [updated] = await database
    .update(schema.subscriptionWorkOrders)
    .set({
      status: 'processing',
      processorAdminId: input.actorId,
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.subscriptionWorkOrders.id, input.workOrderId),
        eq(schema.subscriptionWorkOrders.status, 'pending'),
      ),
    )
    .returning();

  if (!updated) {
    throw new AccountDomainError(
      'invalid_subscription_work_order_transition',
      'Subscription work order can no longer be processed.',
      409,
    );
  }

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: updated.userId,
    type: 'subscription_work_order.processing_started',
    entityType: 'subscription_work_order',
    entityId: updated.id,
    metadata: { code: updated.code },
  });

  return updated;
}

export async function approveSubscriptionWorkOrder(input: {
  workOrderId: string;
  actorId: string;
  decisionNote?: string | null;
}) {
  const database = assertWritableDatabase();
  const current = await getWorkOrderForMutation(input.workOrderId);

  if (
    shouldTreatApprovalAsIdempotent({
      status: current.workOrder.status,
      result: current.workOrder.result,
    })
  ) {
    return current.workOrder;
  }

  assertSubscriptionWorkOrderTransition(current.workOrder.status, 'closed');

  const approvalTime = new Date();
  const updated = await database.transaction(async (tx) => {
    await tx.execute(sql`select id from ${schema.users} where id = ${current.workOrder.userId} for update`);

    const [latest] = await tx
      .select()
      .from(schema.subscriptionWorkOrders)
      .where(eq(schema.subscriptionWorkOrders.id, input.workOrderId))
      .limit(1);

    if (!latest) {
      throw new AccountDomainError(
        'subscription_work_order_not_found',
        'Subscription work order not found.',
        404,
      );
    }

    if (shouldTreatApprovalAsIdempotent({ status: latest.status, result: latest.result })) {
      return latest;
    }

    if (latest.status !== 'processing') {
      throw new AccountDomainError(
        'invalid_subscription_work_order_transition',
        'Only processing subscription work orders can be approved.',
        409,
      );
    }

    const currentExpiresAt = await getCurrentPlanExpiryWithExecutor(tx, {
      userId: latest.userId,
      planId: latest.planId,
    });
    const entitlementWindow = getEntitlementWindow({
      approvalTime,
      billingPeriod: current.plan.billingPeriod,
      currentExpiresAt,
    });
    const resolvedVersion = await resolvePlanVersionForEntitlement(current.plan.code, {
      now: approvalTime,
      loader: membershipPlanVersionRepository,
    });

    const [existingOrder] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, latest.orderId))
      .limit(1);

    if (!existingOrder) {
      throw new AccountDomainError('account_not_found', 'Linked subscription order not found.', 404);
    }

    const approvalOrderAction = getSubscriptionApprovalOrderAction(existingOrder.status);

    const order = approvalOrderAction.shouldMarkPaid
      ? (
          await tx
            .update(schema.orders)
            .set({
              status: 'paid',
              paidAt: approvalTime,
              updatedAt: approvalTime,
            })
            .where(and(eq(schema.orders.id, latest.orderId), eq(schema.orders.status, 'pending')))
            .returning()
        )[0]
      : existingOrder;

    if (!order) {
      throw new AccountDomainError(
        'invalid_subscription_work_order_transition',
        'Linked subscription order could not be marked paid.',
        409,
      );
    }

    if (approvalOrderAction.shouldMarkPaid) {
      await tx.insert(schema.orderEvents).values({
        orderId: order.id,
        type: 'paid',
        actorUserId: input.actorId,
        message: input.decisionNote ?? 'Admin approved membership subscription payment.',
        metadata: {
          source: 'subscription_work_order_approval',
          workOrderId: latest.id,
          workOrderCode: latest.code,
        },
      });
    }

    await tx.insert(schema.userEntitlements).values(
      buildMembershipEntitlementRecord({
        userId: latest.userId,
        planId: latest.planId,
        planVersionId: resolvedVersion.id,
        workOrderId: latest.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        startsAt: entitlementWindow.startsAt,
        expiresAt: entitlementWindow.expiresAt,
        approvalTime,
      }),
    );

    const [closed] = await tx
      .update(schema.subscriptionWorkOrders)
      .set({
        status: 'closed',
        result: 'approved',
        processorAdminId: input.actorId,
        processedAt: latest.processedAt ?? approvalTime,
        closedAt: approvalTime,
        decisionNote: input.decisionNote ?? null,
        updatedAt: approvalTime,
      })
      .where(
        and(
          eq(schema.subscriptionWorkOrders.id, latest.id),
          eq(schema.subscriptionWorkOrders.status, 'processing'),
          isNull(schema.subscriptionWorkOrders.result),
        ),
      )
      .returning();

    if (!closed) {
      throw new AccountDomainError(
        'invalid_subscription_work_order_transition',
        'Subscription work order could not be closed.',
        409,
      );
    }

    return closed;
  });

  await qualifyReferralReward({
    referredUserId: updated.userId,
    qualifiedBy: 'membership_activated',
  });

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: updated.userId,
    type: 'subscription_work_order.approved',
    entityType: 'subscription_work_order',
    entityId: updated.id,
    metadata: {
      code: updated.code,
      orderId: updated.orderId,
      planId: updated.planId,
      decisionNote: input.decisionNote ?? null,
    },
  });

  return updated;
}

export async function rejectSubscriptionWorkOrder(input: {
  workOrderId: string;
  actorId: string;
  decisionNote?: string | null;
}) {
  const database = assertWritableDatabase();
  const { workOrder } = await getWorkOrderForMutation(input.workOrderId);
  assertSubscriptionWorkOrderTransition(workOrder.status, 'closed');

  const now = new Date();
  const rejected = await database.transaction(async (tx) => {
    const [order] = await tx
      .update(schema.orders)
      .set({
        status: 'cancelled',
        updatedAt: now,
      })
      .where(and(eq(schema.orders.id, workOrder.orderId), eq(schema.orders.status, 'pending')))
      .returning();

    await tx.insert(schema.orderEvents).values({
      orderId: workOrder.orderId,
      type: 'cancelled',
      actorUserId: input.actorId,
      message: input.decisionNote ?? 'Admin rejected membership subscription payment.',
      metadata: {
        source: 'subscription_work_order_rejection',
        workOrderId: workOrder.id,
        workOrderCode: workOrder.code,
        orderWasPending: Boolean(order),
      },
    });

    const [closed] = await tx
      .update(schema.subscriptionWorkOrders)
      .set({
        status: 'closed',
        result: 'rejected',
        processorAdminId: input.actorId,
        processedAt: workOrder.processedAt ?? now,
        closedAt: now,
        decisionNote: input.decisionNote ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.subscriptionWorkOrders.id, workOrder.id),
          eq(schema.subscriptionWorkOrders.status, 'processing'),
          isNull(schema.subscriptionWorkOrders.result),
        ),
      )
      .returning();

    if (!closed) {
      throw new AccountDomainError(
        'invalid_subscription_work_order_transition',
        'Subscription work order could not be rejected.',
        409,
      );
    }

    return closed;
  });

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: rejected.userId,
    type: 'subscription_work_order.rejected',
    entityType: 'subscription_work_order',
    entityId: rejected.id,
    metadata: {
      code: rejected.code,
      orderId: rejected.orderId,
      planId: rejected.planId,
      decisionNote: input.decisionNote ?? null,
    },
  });

  return rejected;
}

export async function archiveSubscriptionWorkOrder(input: {
  workOrderId: string;
  actorId: string;
}) {
  const database = assertWritableDatabase();
  const { workOrder } = await getWorkOrderForMutation(input.workOrderId);
  assertSubscriptionWorkOrderTransition(workOrder.status, 'archived');

  const now = new Date();
  const [archived] = await database
    .update(schema.subscriptionWorkOrders)
    .set({
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.subscriptionWorkOrders.id, input.workOrderId),
        eq(schema.subscriptionWorkOrders.status, 'closed'),
      ),
    )
    .returning();

  if (!archived) {
    throw new AccountDomainError(
      'invalid_subscription_work_order_transition',
      'Subscription work order could not be archived.',
      409,
    );
  }

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: archived.userId,
    type: 'subscription_work_order.archived',
    entityType: 'subscription_work_order',
    entityId: archived.id,
    metadata: { code: archived.code },
  });

  return archived;
}
