import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountDomainError } from '@/server/auth/account-types';

import { adjustUserPointsByAdmin } from './users';

test('adjustUserPointsByAdmin writes signed ledger adjustment and audit event', async () => {
  const ledgerCalls: Array<Record<string, unknown>> = [];
  const auditCalls: Array<Record<string, unknown>> = [];

  const result = await adjustUserPointsByAdmin(
    {
      userId: 'user-1',
      actorId: 'admin-1',
      amount: -25.5,
      reason: ' Manual correction ',
    },
    {
      async getUserById() {
        return {
          id: 'user-1',
          metadata: {},
        } as Awaited<ReturnType<typeof import('./users').getUserById>>;
      },
      async adjustCredits(input) {
        ledgerCalls.push(input);
        return {
          entryId: 'ledger-1',
          balanceAfter: 74.5,
        };
      },
      async recordAuditEvent(input) {
        auditCalls.push(input);
        return {} as never;
      },
      createIdempotencyKey() {
        return 'admin-points-adjustment:test';
      },
    },
  );

  assert.deepEqual(result, {
    userId: 'user-1',
    entryId: 'ledger-1',
    amount: -25.5,
    balanceAfter: 74.5,
    reason: 'Manual correction',
  });
  assert.deepEqual(ledgerCalls, [
    {
      userId: 'user-1',
      amount: -25.5,
      idempotencyKey: 'admin-points-adjustment:test',
      reason: 'Manual correction',
      metadata: {
        source: 'admin_manual_adjustment',
        actorId: 'admin-1',
        targetUserId: 'user-1',
        reason: 'Manual correction',
      },
    },
  ]);
  assert.deepEqual(auditCalls, [
    {
      actorId: 'admin-1',
      targetId: 'user-1',
      type: 'user.points_adjusted',
      entityType: 'credit_ledger_entry',
      entityId: 'ledger-1',
      metadata: {
        amount: -25.5,
        balanceAfter: 74.5,
        reason: 'Manual correction',
      },
    },
  ]);
});

test('adjustUserPointsByAdmin rejects unknown users before touching ledger', async () => {
  await assert.rejects(
    () =>
      adjustUserPointsByAdmin(
        {
          userId: 'missing-user',
          actorId: 'admin-1',
          amount: 10,
          reason: 'Missing user check',
        },
        {
          async getUserById(userId: string) {
            void userId;
            return null;
          },
          async adjustCredits() {
            throw new Error('should not be called');
          },
          async recordAuditEvent() {
            throw new Error('should not be called');
          },
          createIdempotencyKey() {
            return 'unused';
          },
        },
      ),
    (error) =>
      error instanceof AccountDomainError &&
      error.code === 'account_not_found' &&
      /Account not found/i.test(error.message),
  );
});
