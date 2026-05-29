import { AccountDomainError } from '@/server/auth/account-types';
import { db, schema } from '@/server/db';

type AuditEventInput = {
  actorId?: string | null;
  targetId?: string | null;
  type: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordAuditEvent(input: AuditEventInput) {
  if (!db) {
    throw new AccountDomainError(
      'database_unavailable',
      'Database connection is unavailable.',
      503,
    );
  }

  const [event] = await db
    .insert(schema.auditEvents)
    .values({
      actorUserId: input.actorId ?? null,
      targetUserId: input.targetId ?? null,
      action: input.type,
      entityType: input.entityType ?? 'user',
      entityId: input.entityId ?? input.targetId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  return event;
}
