import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountDomainError } from '@/server/auth/account-types';

import {
  adjustUserPointsByAdmin,
  createMemoryUserStorageRepository,
  createUserStorageQuota,
  getAdminUserCreditBalance,
} from './users';

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

test('getAdminUserCreditBalance combines legacy credits with ledger sum', async () => {
  const balance = await getAdminUserCreditBalance(
    {
      id: 'user-1',
      metadata: {
        credits: 1280,
      },
    } as never,
    {
      readLegacyCreditBalance(metadata) {
        return typeof metadata?.credits === 'number' ? metadata.credits : 0;
      },
      async sumLedgerAmount(userId) {
        assert.equal(userId, 'user-1');
        return 4.5;
      },
    },
  );

  assert.equal(balance, 1284.5);
});

test('getAdminUserCreditBalance parses legacy string credits before combining ledger sum', async () => {
  const balance = await getAdminUserCreditBalance(
    {
      id: 'user-1',
      metadata: {
        credits: '1,280',
      },
    } as never,
    {
      readLegacyCreditBalance(metadata) {
        const credits = metadata?.credits;
        if (typeof credits === 'number') {
          return credits;
        }

        if (typeof credits === 'string') {
          const parsed = Number(credits.replaceAll(',', '').trim());
          return Number.isFinite(parsed) ? parsed : 0;
        }

        return 0;
      },
      async sumLedgerAmount(userId) {
        assert.equal(userId, 'user-1');
        return 4.5;
      },
    },
  );

  assert.equal(balance, 1284.5);
});

test('getAdminUserCreditBalance accepts numeric-string ledger totals', async () => {
  const balance = await getAdminUserCreditBalance(
    {
      id: 'user-1',
      metadata: {},
    } as never,
    {
      readLegacyCreditBalance() {
        return 0;
      },
      async sumLedgerAmount(userId) {
        assert.equal(userId, 'user-1');
        return Number('11283.50');
      },
    },
  );

  assert.equal(balance, 11283.5);
});

test('storage quota owner rejects saves that exceed remaining bytes', () => {
  const quota = createUserStorageQuota({
    storageQuotaBytes: 2_000,
    storageUsedBytes: 1_500,
  });

  assert.equal(quota.canAllocate(400), true);
  assert.equal(quota.canAllocate(600), false);
});

test('storage quota owner updates used bytes on save and delete', async () => {
  const repository = createMemoryUserStorageRepository();

  await repository.setStorageQuota('user-1', { storageQuotaBytes: 2_000, storageUsedBytes: 500 });
  await repository.incrementStorageUsedBytes('user-1', 300);
  await repository.incrementStorageUsedBytes('user-1', -200);

  const quota = await repository.getStorageQuota('user-1');
  assert.deepEqual(quota, { storageQuotaBytes: 2_000, storageUsedBytes: 600 });
});

test('storage quota owner applies membership quota snapshot without mutating used bytes', async () => {
  const repository = createMemoryUserStorageRepository({
    'user-1': { storageQuotaBytes: 2_000, storageUsedBytes: 600 },
  });

  const quota = await repository.applyMembershipMediaQuota('user-1', 4_000);

  assert.deepEqual(quota, { storageQuotaBytes: 4_000, storageUsedBytes: 600 });
});
