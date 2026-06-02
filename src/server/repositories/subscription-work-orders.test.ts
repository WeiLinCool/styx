import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSubscriptionOrderNumber,
  chooseActiveSubscriptionWorkOrder,
  formatSubscriptionWorkOrderCode,
  shouldTreatApprovalAsIdempotent,
} from './subscription-work-orders';

test('chooseActiveSubscriptionWorkOrder returns pending or processing work order for same user and plan', () => {
  const rows = [
    {
      id: 'closed-1',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'closed' as const,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    {
      id: 'pending-1',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'pending' as const,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    },
  ];

  assert.equal(chooseActiveSubscriptionWorkOrder(rows, 'user-1', 'plan-1')?.id, 'pending-1');
  assert.equal(chooseActiveSubscriptionWorkOrder(rows, 'user-2', 'plan-1'), null);
});

test('approval idempotency recognizes already approved closed work order', () => {
  assert.equal(shouldTreatApprovalAsIdempotent({ status: 'closed', result: 'approved' }), true);
  assert.equal(shouldTreatApprovalAsIdempotent({ status: 'closed', result: 'rejected' }), false);
  assert.equal(shouldTreatApprovalAsIdempotent({ status: 'processing', result: null }), false);
});

test('subscription work order code and order number are stable prefixes', () => {
  const now = new Date('2026-06-02T03:04:05.000Z');

  assert.match(formatSubscriptionWorkOrderCode(now, 'abcdef1234567890'), /^MSWO-20260602-ABCDEF12$/);
  assert.match(buildSubscriptionOrderNumber(now, 'abcdef1234567890'), /^MS-20260602-ABCDEF12$/);
});
