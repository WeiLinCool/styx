import { and, eq } from 'drizzle-orm';

import { recordAuditEvent } from '@/server/audit/audit-service';
import { db, schema } from '@/server/db';
import {
  AccountDomainError,
  hashSecret,
  type AccountState,
} from './account-types';
import { getUserById, setUserAccountState } from '@/server/repositories/users';

export type ActivationWorkOrderStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ActivationWorkOrderAction = 'approve' | 'reject';

export type BrowserFingerprintInput = {
  userAgent?: unknown;
  language?: unknown;
  timezone?: unknown;
  screen?: unknown;
  platform?: unknown;
  hardwareConcurrency?: unknown;
  colorDepth?: unknown;
};

export type NormalizedFingerprintPayload = {
  userAgent: string;
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  platform: string;
  hardwareConcurrency: number;
};

const DEFAULT_WORK_ORDER_TTL_MS = 1000 * 60 * 60 * 24;

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

function stringValue(value: unknown, fallback = 'unknown') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeFingerprintPayload(
  payload: BrowserFingerprintInput,
): NormalizedFingerprintPayload {
  const screen =
    payload.screen && typeof payload.screen === 'object'
      ? (payload.screen as Record<string, unknown>)
      : {};

  return {
    colorDepth: numberValue(payload.colorDepth ?? screen.colorDepth),
    hardwareConcurrency: numberValue(payload.hardwareConcurrency),
    language: stringValue(payload.language),
    platform: stringValue(payload.platform),
    screenHeight: numberValue(screen.height),
    screenWidth: numberValue(screen.width),
    timezone: stringValue(payload.timezone),
    userAgent: stringValue(payload.userAgent),
  };
}

export function buildFingerprintDigest(payload: BrowserFingerprintInput) {
  return hashSecret(JSON.stringify(normalizeFingerprintPayload(payload)));
}

export function buildActivationWorkOrderCode(randomSource = () => crypto.randomUUID()) {
  const compact = randomSource().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().padEnd(8, '0');
  return `ACT-${compact.slice(0, 4)}-${compact.slice(4, 8)}`;
}

export function getActivationWorkOrderTransition(input: {
  currentStatus: ActivationWorkOrderStatus;
  expiresAt: Date;
  action: ActivationWorkOrderAction;
  now?: Date;
}):
  | { ok: true; nextStatus: 'approved' | 'rejected' }
  | { ok: false; code: 'work_order_not_pending' | 'work_order_expired' } {
  const now = input.now ?? new Date();

  if (input.currentStatus !== 'pending') {
    return { ok: false, code: 'work_order_not_pending' };
  }

  if (input.expiresAt <= now) {
    return { ok: false, code: 'work_order_expired' };
  }

  return {
    ok: true,
    nextStatus: input.action === 'approve' ? 'approved' : 'rejected',
  };
}

export function summarizeDeviceMetadata(payload: BrowserFingerprintInput) {
  const normalized = normalizeFingerprintPayload(payload);

  return {
    language: normalized.language,
    platform: normalized.platform,
    screen: `${normalized.screenWidth}x${normalized.screenHeight}`,
    timezone: normalized.timezone,
    userAgent: normalized.userAgent.slice(0, 180),
  };
}

export async function createActivationWorkOrder(input: {
  userId: string;
  fingerprint: BrowserFingerprintInput;
  ttlMs?: number;
}) {
  const database = requireDb();
  const user = await getUserById(input.userId);
  if (!user) {
    throw new AccountDomainError('account_not_found', 'Account not found.', 404);
  }

  const code = buildActivationWorkOrderCode();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_WORK_ORDER_TTL_MS));
  const [workOrder] = await database
    .insert(schema.activationWorkOrders)
    .values({
      userId: input.userId,
      code,
      fingerprintDigest: buildFingerprintDigest(input.fingerprint),
      deviceMetadata: summarizeDeviceMetadata(input.fingerprint),
      expiresAt,
    })
    .returning();

  await recordAuditEvent({
    actorId: input.userId,
    targetId: input.userId,
    type: 'account.activation_work_order_created',
    metadata: {
      workOrderId: workOrder.id,
      code: workOrder.code,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return workOrder;
}

async function getWorkOrderById(workOrderId: string) {
  const database = requireDb();
  const [row] = await database
    .select()
    .from(schema.activationWorkOrders)
    .where(eq(schema.activationWorkOrders.id, workOrderId))
    .limit(1);

  return row ?? null;
}

function toDomainError(code: 'work_order_not_pending' | 'work_order_expired') {
  return new AccountDomainError(
    code,
    code === 'work_order_expired'
      ? 'Activation work order has expired.'
      : 'Activation work order is not pending.',
    409,
  );
}

export async function approveActivationWorkOrder(input: {
  workOrderId: string;
  actorId: string;
  reason?: string | null;
}) {
  const database = requireDb();
  const workOrder = await getWorkOrderById(input.workOrderId);
  if (!workOrder) {
    throw new AccountDomainError('work_order_not_found', 'Activation work order not found.', 404);
  }

  const transition = getActivationWorkOrderTransition({
    currentStatus: workOrder.status,
    expiresAt: workOrder.expiresAt,
    action: 'approve',
  });
  if (!transition.ok) {
    throw toDomainError(transition.code);
  }

  const now = new Date();
  const [updated] = await database
    .update(schema.activationWorkOrders)
    .set({
      status: transition.nextStatus,
      approvedByUserId: input.actorId,
      approvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.activationWorkOrders.id, input.workOrderId),
        eq(schema.activationWorkOrders.status, 'pending'),
      ),
    )
    .returning();

  if (!updated) {
    throw toDomainError('work_order_not_pending');
  }

  const user = await setUserAccountState(
    workOrder.userId,
    'active' satisfies AccountState,
    input.actorId,
    input.reason ?? 'activation_work_order_approved',
  );

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: workOrder.userId,
    type: 'account.activation_work_order_approved',
    metadata: {
      workOrderId: workOrder.id,
      code: workOrder.code,
      reason: input.reason ?? null,
    },
  });

  return { workOrder: updated, user };
}

export async function rejectActivationWorkOrder(input: {
  workOrderId: string;
  actorId: string;
  reason: string;
}) {
  const database = requireDb();
  const workOrder = await getWorkOrderById(input.workOrderId);
  if (!workOrder) {
    throw new AccountDomainError('work_order_not_found', 'Activation work order not found.', 404);
  }

  const transition = getActivationWorkOrderTransition({
    currentStatus: workOrder.status,
    expiresAt: workOrder.expiresAt,
    action: 'reject',
  });
  if (!transition.ok) {
    throw toDomainError(transition.code);
  }

  const now = new Date();
  const [updated] = await database
    .update(schema.activationWorkOrders)
    .set({
      status: transition.nextStatus,
      rejectedByUserId: input.actorId,
      rejectedAt: now,
      rejectionReason: input.reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.activationWorkOrders.id, input.workOrderId),
        eq(schema.activationWorkOrders.status, 'pending'),
      ),
    )
    .returning();

  if (!updated) {
    throw toDomainError('work_order_not_pending');
  }

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: workOrder.userId,
    type: 'account.activation_work_order_rejected',
    metadata: {
      workOrderId: workOrder.id,
      code: workOrder.code,
      reason: input.reason,
    },
  });

  return updated;
}
