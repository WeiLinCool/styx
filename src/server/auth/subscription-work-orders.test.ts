import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMembershipPeriod,
  assertSubscriptionWorkOrderTransition,
  buildMembershipEntitlementRecord,
  getEntitlementWindow,
  getSubscriptionApprovalOrderAction,
} from './subscription-work-orders';

test('subscription work order transitions follow queue lifecycle', () => {
  assert.doesNotThrow(() => assertSubscriptionWorkOrderTransition('pending', 'processing'));
  assert.doesNotThrow(() => assertSubscriptionWorkOrderTransition('processing', 'closed'));
  assert.doesNotThrow(() => assertSubscriptionWorkOrderTransition('closed', 'archived'));

  assert.throws(
    () => assertSubscriptionWorkOrderTransition('pending', 'closed'),
    /Invalid subscription work order transition/,
  );
  assert.throws(
    () => assertSubscriptionWorkOrderTransition('closed', 'processing'),
    /Invalid subscription work order transition/,
  );
});

test('membership period helper adds calendar months and years', () => {
  assert.equal(
    addMembershipPeriod(new Date('2026-01-15T00:00:00.000Z'), 'month').toISOString(),
    '2026-02-15T00:00:00.000Z',
  );
  assert.equal(
    addMembershipPeriod(new Date('2026-01-15T00:00:00.000Z'), 'year').toISOString(),
    '2027-01-15T00:00:00.000Z',
  );
});

test('entitlement window extends from active expiry', () => {
  const approvalTime = new Date('2026-06-02T00:00:00.000Z');
  const currentExpiry = new Date('2026-06-12T00:00:00.000Z');
  const window = getEntitlementWindow({
    approvalTime,
    billingPeriod: 'month',
    currentExpiresAt: currentExpiry,
  });

  assert.equal(window.startsAt.toISOString(), approvalTime.toISOString());
  assert.equal(window.expiresAt.toISOString(), '2026-07-12T00:00:00.000Z');
});

test('entitlement window starts from approval when no active expiry exists', () => {
  const approvalTime = new Date('2026-06-02T00:00:00.000Z');
  const expired = new Date('2026-05-01T00:00:00.000Z');
  const window = getEntitlementWindow({
    approvalTime,
    billingPeriod: 'year',
    currentExpiresAt: expired,
  });

  assert.equal(window.startsAt.toISOString(), approvalTime.toISOString());
  assert.equal(window.expiresAt.toISOString(), '2027-06-02T00:00:00.000Z');
});

test('unsupported one-time membership period is rejected', () => {
  assert.throws(
    () => addMembershipPeriod(new Date('2026-06-02T00:00:00.000Z'), 'one_time'),
    /Unsupported membership billing period/,
  );
});

test('subscription approval accepts already-paid linked orders without requiring another paid transition', () => {
  assert.deepEqual(getSubscriptionApprovalOrderAction('pending'), { shouldMarkPaid: true });
  assert.deepEqual(getSubscriptionApprovalOrderAction('paid'), { shouldMarkPaid: false });
});

test('subscription approval rejects linked orders outside pending/paid states', () => {
  assert.throws(
    () => getSubscriptionApprovalOrderAction('cancelled'),
    /Linked subscription order cannot be approved from status cancelled/,
  );
});

test('buildMembershipEntitlementRecord binds the resolved membership plan version', () => {
  const approvalTime = new Date('2026-06-03T00:00:00.000Z');
  const startsAt = new Date('2026-06-03T00:00:00.000Z');
  const expiresAt = new Date('2026-07-03T00:00:00.000Z');

  const record = buildMembershipEntitlementRecord({
    userId: 'user-1',
    planId: 'plan-1',
    planVersionId: 'version-2',
    workOrderId: 'work-order-1',
    orderId: 'order-1',
    orderNumber: 'SUB202606030001',
    startsAt,
    expiresAt,
    approvalTime,
  });

  assert.equal(record.planVersionId, 'version-2');
  assert.equal(record.startsAt.toISOString(), startsAt.toISOString());
  assert.equal(record.expiresAt?.toISOString(), expiresAt.toISOString());
  assert.deepEqual(record.metadata, {
    source: 'subscription_work_order',
    workOrderId: 'work-order-1',
    orderId: 'order-1',
    orderNumber: 'SUB202606030001',
  });
});
