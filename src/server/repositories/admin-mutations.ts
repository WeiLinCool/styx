import { eq } from 'drizzle-orm';

import { recordAuditEvent } from '@/server/audit/audit-service';
import { AccountDomainError } from '@/server/auth/account-types';
import { grantCredits } from '@/server/billing/credits';
import { db, schema } from '@/server/db';
import { buildReferralRewardKey } from '@/server/points/service';
import {
  getReferralByReferredUserId,
  markReferralQualified,
  shouldSkipReferralQualification,
} from '@/server/repositories/points';

export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
export type OrderEventType = 'created' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded' | 'note';
export type AiJobReviewAction = 'review' | 'rerun' | 'cancel' | 'mark_resolved';
export type ReferralQualificationSource = 'order_paid' | 'membership_activated';

const REFERRAL_REWARD_POINTS = 200;

function requireDb() {
  if (!db) {
    throw new AccountDomainError(
      'database_unavailable',
      'Database connection is unavailable.',
      503,
    );
  }

  return db;
}

export function mapOrderStatusToEventType(status: OrderStatus): OrderEventType {
  const eventTypes: Record<OrderStatus, OrderEventType> = {
    pending: 'created',
    paid: 'paid',
    fulfilled: 'fulfilled',
    cancelled: 'cancelled',
    refunded: 'refunded',
  };

  return eventTypes[status];
}

export function normalizeAiJobReviewAction(action: string): AiJobReviewAction {
  if (
    action === 'review' ||
    action === 'rerun' ||
    action === 'cancel' ||
    action === 'mark_resolved'
  ) {
    return action;
  }

  throw new Error(`Unsupported AI job review action: ${action}`);
}

type ReferralRecord = Awaited<ReturnType<typeof getReferralByReferredUserId>>;
type QualificationDeps = {
  getReferralByReferredUserId: typeof getReferralByReferredUserId;
  grantCredits: typeof grantCredits;
  markReferralQualified: typeof markReferralQualified;
  buildReferralRewardKey: typeof buildReferralRewardKey;
};

const defaultQualificationDeps: QualificationDeps = {
  getReferralByReferredUserId,
  grantCredits,
  markReferralQualified,
  buildReferralRewardKey,
};

export function shouldQualifyReferralFromOrderStatusChange(
  previousStatus: OrderStatus,
  nextStatus: OrderStatus,
) {
  return previousStatus !== 'paid' && nextStatus === 'paid';
}

export async function qualifyReferralReward(
  input: {
    referredUserId: string;
    qualifiedBy: ReferralQualificationSource;
  },
  deps: QualificationDeps = defaultQualificationDeps,
) {
  const referral = await deps.getReferralByReferredUserId(input.referredUserId);
  if (!referral || shouldSkipReferralQualification(referral)) {
    return {
      qualified: false,
      ledgerEntryId: null,
      referral,
    };
  }

  const reward = await deps.grantCredits({
    userId: referral.referrerUserId,
    amount: REFERRAL_REWARD_POINTS,
    idempotencyKey: deps.buildReferralRewardKey(input.referredUserId),
    reason: 'referral reward',
    metadata: {
      referredUserId: input.referredUserId,
      referralId: referral.id,
      qualifiedBy: input.qualifiedBy,
    },
  });

  const qualifiedReferral = await deps.markReferralQualified({
    referredUserId: input.referredUserId,
    qualifiedBy: input.qualifiedBy,
    rewardLedgerEntryId: reward.entryId,
  });

  if (!qualifiedReferral) {
    throw new Error('Referral qualification could not be persisted.');
  }

  return {
    qualified: true,
    ledgerEntryId: reward.entryId,
    referral: qualifiedReferral satisfies ReferralRecord,
  };
}

export async function updateOrderStatus(input: {
  orderId: string;
  status: OrderStatus;
  actorId: string;
  note?: string | null;
}) {
  const database = requireDb();
  const [existingOrder] = await database
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, input.orderId))
    .limit(1);

  if (!existingOrder) {
    throw new AccountDomainError('account_not_found', 'Order not found.', 404);
  }

  const now = new Date();
  const metadata = input.note ? { note: input.note } : {};
  const [order] = await database
    .update(schema.orders)
    .set({
      status: input.status,
      paidAt: input.status === 'paid' ? now : undefined,
      metadata,
      updatedAt: now,
    })
    .where(eq(schema.orders.id, input.orderId))
    .returning();

  if (!order) {
    throw new AccountDomainError('account_not_found', 'Order not found.', 404);
  }

  if (shouldQualifyReferralFromOrderStatusChange(existingOrder.status, input.status)) {
    await qualifyReferralReward({
      referredUserId: order.userId,
      qualifiedBy: 'order_paid',
    });
  }

  await database.insert(schema.orderEvents).values({
    orderId: order.id,
    type: mapOrderStatusToEventType(input.status),
    actorUserId: input.actorId,
    message: input.note ?? `Admin changed order status to ${input.status}.`,
    metadata: {
      status: input.status,
      note: input.note ?? null,
    },
  });

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: order.userId,
    type: 'order.status_updated',
    entityType: 'order',
    entityId: order.id,
    metadata: {
      status: input.status,
      note: input.note ?? null,
    },
  });

  return order;
}

export async function addOrderNote(input: {
  orderId: string;
  actorId: string;
  note: string;
}) {
  const database = requireDb();
  const [order] = await database
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, input.orderId))
    .limit(1);

  if (!order) {
    throw new AccountDomainError('account_not_found', 'Order not found.', 404);
  }

  await database.insert(schema.orderEvents).values({
    orderId: order.id,
    type: 'note',
    actorUserId: input.actorId,
    message: input.note,
    metadata: { note: input.note },
  });

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: order.userId,
    type: 'order.note_added',
    entityType: 'order',
    entityId: order.id,
    metadata: { note: input.note },
  });

  return order;
}

export async function reviewAiJob(input: {
  jobId: string;
  action: AiJobReviewAction;
  actorId: string;
  note?: string | null;
}) {
  const database = requireDb();
  const now = new Date();
  const nextValues =
    input.action === 'rerun'
      ? {
          status: 'queued' as const,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        }
      : input.action === 'cancel'
        ? {
            status: 'cancelled' as const,
            completedAt: now,
            updatedAt: now,
          }
        : input.action === 'mark_resolved'
          ? {
              status: 'succeeded' as const,
              errorMessage: null,
              completedAt: now,
              updatedAt: now,
            }
          : {
              updatedAt: now,
            };

  const [job] = await database
    .update(schema.aiJobs)
    .set(nextValues)
    .where(eq(schema.aiJobs.id, input.jobId))
    .returning();

  if (!job) {
    throw new AccountDomainError('account_not_found', 'AI job not found.', 404);
  }

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: job.userId,
    type: `ai_job.${input.action}`,
    entityType: 'ai_job',
    entityId: job.id,
    metadata: {
      action: input.action,
      note: input.note ?? null,
      status: job.status,
    },
  });

  return job;
}
