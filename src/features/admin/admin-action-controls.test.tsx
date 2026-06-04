import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAdminOrderActions,
  getAdminSubscriptionWorkOrderActions,
  getAdminSubscriptionWorkOrderBlockingMessage,
} from './admin-action-controls';

test('pending subscription work orders stay blocked until the linked order is marked paid', () => {
  const actions = getAdminSubscriptionWorkOrderActions('work-order-1', 'pending', 'pending');

  assert.deepEqual(actions.map((action) => action.label), ['拒绝并取消订单']);
  assert.equal(
    getAdminSubscriptionWorkOrderBlockingMessage('pending', 'pending'),
    '请先到订单管理将关联订单标记为已支付，再回来通过并开通会员。',
  );
});

test('subscription work orders can approve after the linked order is marked paid', () => {
  const actions = getAdminSubscriptionWorkOrderActions('work-order-1', 'pending', 'paid');

  assert.deepEqual(actions.map((action) => action.label), ['通过并开通', '拒绝并取消订单']);
});

test('membership orders only expose pay and note actions before approval', () => {
  const actions = getAdminOrderActions('order-1', 'paid', true);

  assert.deepEqual(actions.map((action) => action.label), ['备注']);
});

test('admin order actions hide pay and fulfill controls for fulfilled orders', () => {
  const actions = getAdminOrderActions('order-1', 'fulfilled');

  assert.deepEqual(actions.map((action) => action.label), ['备注']);
});
