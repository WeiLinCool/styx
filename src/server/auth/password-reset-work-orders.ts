import { and, desc, eq } from 'drizzle-orm';

import { recordAuditEvent } from '@/server/audit/audit-service';
import { db, schema } from '@/server/db';
import { getUserByPhone, updateUserMetadata } from '@/server/repositories/users';
import { AccountDomainError } from './account-types';
import { hashUserPassword } from './public-auth';

export type PasswordResetWorkOrderStatus = 'pending' | 'processing' | 'closed' | 'archived';

export type PasswordResetWorkOrderRecord = {
  id: string;
  phone: string;
  userId: string;
  userLabel: string;
  reason: string;
  status: PasswordResetWorkOrderStatus;
  temporaryPassword: string | null;
  createdAt: string;
  processedAt: string | null;
  archivedAt: string | null;
};

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

function generateTemporaryPassword() {
  const suffix = Math.random().toString(36).slice(-6).toUpperCase();
  return `NF-${suffix}`;
}

function toRecord(row: {
  workOrder: typeof schema.passwordResetWorkOrders.$inferSelect;
  user: typeof schema.users.$inferSelect;
}): PasswordResetWorkOrderRecord {
  return {
    id: row.workOrder.id,
    phone: row.workOrder.phone,
    userId: row.workOrder.userId,
    userLabel: `${row.user.displayName} / ${row.user.phone ?? row.user.email ?? row.workOrder.phone}`,
    reason: row.workOrder.reason,
    status: row.workOrder.status,
    temporaryPassword: row.workOrder.temporaryPassword,
    createdAt: row.workOrder.createdAt.toISOString(),
    processedAt: row.workOrder.processedAt?.toISOString() ?? null,
    archivedAt: row.workOrder.archivedAt?.toISOString() ?? null,
  };
}

async function getPasswordResetWorkOrderById(workOrderId: string) {
  const database = requireDb();
  const [row] = await database
    .select({
      workOrder: schema.passwordResetWorkOrders,
      user: schema.users,
    })
    .from(schema.passwordResetWorkOrders)
    .innerJoin(schema.users, eq(schema.passwordResetWorkOrders.userId, schema.users.id))
    .where(eq(schema.passwordResetWorkOrders.id, workOrderId))
    .limit(1);

  return row ?? null;
}

export async function createPasswordResetWorkOrder(input: {
  phone: string;
  reason?: string | null;
}) {
  const database = requireDb();
  const phone = input.phone.trim();
  const user = await getUserByPhone(phone);
  if (!user) {
    throw new AccountDomainError('account_not_found', '当前手机号未注册账号。', 404);
  }

  const [workOrder] = await database
    .insert(schema.passwordResetWorkOrders)
    .values({
      userId: user.id,
      phone,
      reason: input.reason?.trim() || '用户忘记密码',
    })
    .returning();

  await recordAuditEvent({
    actorId: user.id,
    targetId: user.id,
    type: 'account.password_reset_work_order_created',
    metadata: {
      workOrderId: workOrder.id,
      phone,
    },
  });

  return {
    id: workOrder.id,
    status: workOrder.status,
  };
}

export async function listPasswordResetWorkOrders(status?: PasswordResetWorkOrderStatus) {
  const database = requireDb();
  const rows = await database
    .select({
      workOrder: schema.passwordResetWorkOrders,
      user: schema.users,
    })
    .from(schema.passwordResetWorkOrders)
    .innerJoin(schema.users, eq(schema.passwordResetWorkOrders.userId, schema.users.id))
    .where(status ? eq(schema.passwordResetWorkOrders.status, status) : undefined)
    .orderBy(desc(schema.passwordResetWorkOrders.createdAt))
    .limit(200);

  return rows.map(toRecord);
}

export async function startPasswordResetWorkOrderProcessing(workOrderId: string) {
  const database = requireDb();
  const current = await getPasswordResetWorkOrderById(workOrderId);
  if (!current) {
    throw new AccountDomainError('work_order_not_found', '密码重置工单不存在。', 404);
  }

  if (current.workOrder.status !== 'pending') {
    throw new AccountDomainError('work_order_not_pending', '当前工单不能开始处理。', 409);
  }

  const now = new Date();
  const [updated] = await database
    .update(schema.passwordResetWorkOrders)
    .set({
      status: 'processing',
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.passwordResetWorkOrders.id, workOrderId),
        eq(schema.passwordResetWorkOrders.status, 'pending'),
      ),
    )
    .returning();

  if (!updated) {
    throw new AccountDomainError('work_order_not_pending', '当前工单不能开始处理。', 409);
  }

  return updated;
}

export async function approvePasswordResetWorkOrder(input: {
  workOrderId: string;
  actorId: string;
}) {
  const database = requireDb();
  const current = await getPasswordResetWorkOrderById(input.workOrderId);
  if (!current) {
    throw new AccountDomainError('work_order_not_found', '密码重置工单不存在。', 404);
  }

  if (current.workOrder.status !== 'processing') {
    throw new AccountDomainError('work_order_not_pending', '当前工单未处于处理中。', 409);
  }

  const user = await getUserByPhone(current.workOrder.phone);
  if (!user) {
    throw new AccountDomainError('account_not_found', '当前手机号未注册账号。', 404);
  }

  const temporaryPassword = generateTemporaryPassword();
  await updateUserMetadata(user.id, {
    ...(user.metadata ?? {}),
    passwordHash: hashUserPassword(temporaryPassword),
    mustResetPassword: true,
    temporaryPasswordIssuedAt: new Date().toISOString(),
  });

  const now = new Date();
  const [updated] = await database
    .update(schema.passwordResetWorkOrders)
    .set({
      status: 'closed',
      temporaryPassword,
      processedByUserId: input.actorId,
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.passwordResetWorkOrders.id, input.workOrderId),
        eq(schema.passwordResetWorkOrders.status, 'processing'),
      ),
    )
    .returning();

  if (!updated) {
    throw new AccountDomainError('work_order_not_pending', '当前工单未处于处理中。', 409);
  }

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: user.id,
    type: 'account.password_reset_work_order_approved',
    metadata: {
      workOrderId: updated.id,
    },
  });

  return updated;
}

export async function archivePasswordResetWorkOrder(input: {
  workOrderId: string;
  actorId: string;
}) {
  const database = requireDb();
  const current = await getPasswordResetWorkOrderById(input.workOrderId);
  if (!current) {
    throw new AccountDomainError('work_order_not_found', '密码重置工单不存在。', 404);
  }

  if (current.workOrder.status !== 'closed') {
    throw new AccountDomainError('work_order_not_pending', '仅已办结工单可归档。', 409);
  }

  const now = new Date();
  const [updated] = await database
    .update(schema.passwordResetWorkOrders)
    .set({
      status: 'archived',
      archivedByUserId: input.actorId,
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.passwordResetWorkOrders.id, input.workOrderId),
        eq(schema.passwordResetWorkOrders.status, 'closed'),
      ),
    )
    .returning();

  if (!updated) {
    throw new AccountDomainError('work_order_not_pending', '仅已办结工单可归档。', 409);
  }

  await recordAuditEvent({
    actorId: input.actorId,
    targetId: current.workOrder.userId,
    type: 'account.password_reset_work_order_archived',
    metadata: {
      workOrderId: updated.id,
    },
  });

  return updated;
}
