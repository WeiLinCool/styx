import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminSubscriptionWorkOrders } from './admin-subscription-work-orders';

test('seed subscription work orders expose relation summary for order-to-membership linkage', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  try {
    delete process.env.DATABASE_URL;
    const data = await getAdminSubscriptionWorkOrders();

    assert.equal(data.records[0]?.relationSummary, '工单待核销，订单待支付，会员权益未开通');
    assert.equal(data.filters[0]?.label, '全部');
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
